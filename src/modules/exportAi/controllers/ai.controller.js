const { asyncHandler } = require("../utils/asyncHandler");
const { AI_MODELS, DEFAULT_MODEL } = require("../config/aiModels");
const { OUTPUT_TEMPLATE_LIST } = require("../config/templates");
const { DEFAULT_OUTPUT_TEMPLATE } = require("../utils/constants");
const { aiConfig } = require("../config/aiConfig");
const { verifyGemini } = require("../services/gemini.service");
const { Job } = require("../models/Job");

const listModels = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    defaultModel: DEFAULT_MODEL,
    mockMode: aiConfig.gemini.mockMode,
    selectedModel: (req.user && req.user.preferredAiModel) || DEFAULT_MODEL,
    models: AI_MODELS,
  });
});

const listTemplates = asyncHandler(async (_req, res) => {
  res.json({ success: true, defaultTemplate: DEFAULT_OUTPUT_TEMPLATE, templates: OUTPUT_TEMPLATE_LIST });
});

const checkModel = asyncHandler(async (req, res) => {
  const result = await verifyGemini(req.query.model);
  res.json({ success: true, ...result });
});

/* ------------------------------------------------------------------ */
/*  AI Costing & Usage analytics (Super Admin only).                  */
/*  Aggregates per-user job/document/generation counts and Gemini     */
/*  token usage, converting USD cost to INR (USD_TO_INR, default 86). */
/* ------------------------------------------------------------------ */
const getUsageAnalytics = asyncHandler(async (_req, res) => {
  const inr = aiConfig.usdToInr || 86;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Per-user lifetime aggregation, joined to the existing User collection.
  const perUser = await Job.aggregate([
    {
      $group: {
        _id: "$owner",
        totalJobs: { $sum: 1 },
        documentsUploaded: { $sum: { $size: { $ifNull: ["$documents", []] } } },
        hblGenerated: { $sum: { $cond: [{ $eq: ["$shipmentReport.generated", true] }, 1, 0] } },
        mblGenerated: { $sum: { $cond: [{ $eq: ["$mbl.generated", true] }, 1, 0] } },
        isfGenerated: { $sum: { $cond: [{ $eq: ["$isf.generated", true] }, 1, 0] } },
        analyses: { $sum: { $ifNull: ["$aiUsage.analyses", 0] } },
        inputTokens: { $sum: { $ifNull: ["$aiUsage.inputTokens", 0] } },
        outputTokens: { $sum: { $ifNull: ["$aiUsage.outputTokens", 0] } },
        totalTokens: { $sum: { $ifNull: ["$aiUsage.totalTokens", 0] } },
        costUsd: { $sum: { $ifNull: ["$aiUsage.costUsd", 0] } },
        models: { $addToSet: { $ifNull: ["$aiUsage.model", "$aiModel"] } },
      },
    },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    { $sort: { costUsd: -1 } },
  ]);

  // Time-bounded cost (and tokens) per user for daily / monthly columns.
  const bounded = async (since) =>
    Job.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$owner", costUsd: { $sum: { $ifNull: ["$aiUsage.costUsd", 0] } }, totalTokens: { $sum: { $ifNull: ["$aiUsage.totalTokens", 0] } } } },
    ]);
  const [todayRows, monthRows] = await Promise.all([bounded(startOfDay), bounded(startOfMonth)]);
  const todayMap = new Map(todayRows.map((r) => [String(r._id), r.costUsd]));
  const monthMap = new Map(monthRows.map((r) => [String(r._id), r.costUsd]));

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const users = perUser.map((r) => {
    const id = String(r._id);
    const model = (r.models || []).filter(Boolean).join(", ") || DEFAULT_MODEL;
    const todayUsd = todayMap.get(id) || 0;
    const monthUsd = monthMap.get(id) || 0;
    return {
      userId: id,
      username: r.user?.username || "(deleted user)",
      fullName: r.user?.fullName || "",
      role: r.user?.role || "",
      totalJobs: r.totalJobs,
      documentsUploaded: r.documentsUploaded,
      hblGenerated: r.hblGenerated,
      mblGenerated: r.mblGenerated,
      isfGenerated: r.isfGenerated,
      analyses: r.analyses,
      model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      totalTokens: r.totalTokens,
      costUsd: round2(r.costUsd),
      costInr: round2(r.costUsd * inr),
      todayCostInr: round2(todayUsd * inr),
      monthCostInr: round2(monthUsd * inr),
    };
  });

  const sum = (arr, key) => arr.reduce((a, x) => a + (x[key] || 0), 0);
  const totalCostUsd = sum(perUser, "costUsd");
  const totalTokens = sum(perUser, "totalTokens");
  const todayCostUsd = todayRows.reduce((a, x) => a + (x.costUsd || 0), 0);
  const monthCostUsd = monthRows.reduce((a, x) => a + (x.costUsd || 0), 0);

  const mostActive = users.slice().sort((a, b) => b.totalJobs - a.totalJobs)[0];
  const highestCost = users.slice().sort((a, b) => b.costInr - a.costInr)[0];

  res.json({
    success: true,
    currency: "INR",
    usdToInr: inr,
    generatedAt: now,
    summary: {
      totalCostInr: round2(totalCostUsd * inr),
      todayCostInr: round2(todayCostUsd * inr),
      monthCostInr: round2(monthCostUsd * inr),
      totalTokens,
      totalJobs: sum(users, "totalJobs"),
      totalUsers: users.length,
      mostActiveUser: mostActive ? { username: mostActive.username, totalJobs: mostActive.totalJobs } : null,
      highestCostUser: highestCost ? { username: highestCost.username, costInr: highestCost.costInr } : null,
    },
    users,
  });
});

module.exports = { listModels, listTemplates, checkModel, getUsageAnalytics };
