const { validateVerificationPayload } = require("../validation/verificationValidation");
const { compareChecklist, describeAiError } = require("../services/geminiCompareService");
const { createJob, getJob, completeJob, failJob } = require("../services/jobStore");
const { geminiConfig } = require("../config/geminiConfig");
const VerificationRecord = require("../models/VerificationRecord");
const { isSuperAdmin } = require("../../middleware/importAuth");

const str = (v) => (v == null ? "" : String(v).trim());

/* ------------------------------------------------------------------ */
/*  AI Document Verification controller (async job pattern)           */
/*                                                                    */
/*  POST /compare        -> validate, start a background job, return    */
/*                          { jobId } immediately (fast, never trips a   */
/*                          proxy gateway timeout).                     */
/*  GET  /compare/:jobId -> poll job status/result (fast).             */
/* ------------------------------------------------------------------ */
const log = (level, msg, extra) => {
  try {
    // eslint-disable-next-line no-console
    (console[level] || console.log)(`[DocVerify] ${msg}` + (extra ? ` ${JSON.stringify(extra)}` : ""));
  } catch {
    /* ignore */
  }
};

// Kick off a comparison and return a job id right away.
const startComparison = (req, res) => {
  try {
    const { valid, errors, checklist, systemDocs } = validateVerificationPayload(req.body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const totalMb = [checklist, ...systemDocs].reduce((n, f) => n + (f.size || 0), 0) / 1048576;
    const jobId = createJob({ checklist: checklist.originalname, systemDocs: systemDocs.length });
    log("info", `job ${jobId} start`, { checklist: checklist.originalname, systemDocs: systemDocs.length, sizeMb: Number(totalMb.toFixed(2)), model: geminiConfig.model });

    // Respond first, then process in the background (do NOT await).
    res.status(202).json({ success: true, data: { jobId, status: "processing" } });

    (async () => {
      const started = Date.now();
      try {
        const result = await compareChecklist(checklist, systemDocs);
        completeJob(jobId, result);
        log("info", `job ${jobId} done in ${Date.now() - started}ms`, { match: result.match, score: result.score });
      } catch (err) {
        const message = describeAiError(err);
        failJob(jobId, message);
        log("error", `job ${jobId} failed in ${Date.now() - started}ms: ${err && err.message}`);
      }
    })();
  } catch (error) {
    log("error", `startComparison error: ${error && error.message}`);
    return res.status(500).json({ success: false, message: error.message || "Failed to start verification." });
  }
};

// Poll a job's status/result.
const getComparisonStatus = (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: "Verification job not found or expired. Please run the comparison again." });
  }
  if (job.status === "processing") {
    return res.json({ success: true, data: { status: "processing" } });
  }
  if (job.status === "failed") {
    return res.json({ success: true, data: { status: "failed", message: job.error || "Verification failed." } });
  }
  return res.json({ success: true, data: { status: "completed", result: job.data } });
};

// Lightweight status endpoint for the UI (does AI run live or in mock mode?).
const getStatus = (_req, res) => {
  res.json({
    success: true,
    data: {
      mockMode: geminiConfig.mockMode,
      model: geminiConfig.model,
      maxSystemDocs: geminiConfig.maxSystemDocs,
      maxFileSizeMb: geminiConfig.maxFileSizeMb,
    },
  });
};

/* -------------------------- saved records -------------------------- */

// Only the owner (or a Super Admin) may access a given record.
const canAccess = (req, record) =>
  isSuperAdmin(req) || (record.ownerId && String(record.ownerId) === String((req.importUser || {})._id));

// POST /records — persist a completed verification report.
const saveRecord = async (req, res) => {
  try {
    const { result, checklistFileName, systemDocuments } = req.body || {};
    if (!result || typeof result !== "object" || !result.dashboard) {
      return res.status(400).json({ success: false, message: "Missing or invalid verification result to save." });
    }
    const u = req.importUser || {};
    const d = result.dashboard || {};
    const meta = result.meta || {};
    const record = await VerificationRecord.create({
      checklistFileName: str(checklistFileName) || str(meta.checklist) || "CHA Checklist",
      systemDocuments: Array.isArray(systemDocuments) && systemDocuments.length
        ? systemDocuments.map(String)
        : (Array.isArray(meta.systemDocuments) ? meta.systemDocuments.map(String) : []),
      result,
      verificationStatus: result.match ? "match" : "mismatch",
      matchPercentage: Number(d.matchPercentage) || 0,
      matchedCount: Number(d.totalMatched) || 0,
      unmatchedCount: Number(d.totalUnmatched) || 0,
      missingCount: Number(d.totalMissing) || 0,
      ownerId: u._id,
      createdBy: str(u.fullName) || str(u.username),
      createdByRole: str(u.role),
      createdByLocation: str(u.location),
    });
    log("info", `record ${record._id} saved`, { by: record.createdBy, status: record.verificationStatus });
    return res.status(201).json({ success: true, message: "Verification record saved.", data: { id: record._id } });
  } catch (error) {
    log("error", `saveRecord error: ${error && error.message}`);
    return res.status(500).json({ success: false, message: error.message || "Failed to save record." });
  }
};

// GET /records — list records (own records; Super Admin sees all). Excludes the
// heavy result payload for a fast, light list.
const listRecords = async (req, res) => {
  try {
    const filter = isSuperAdmin(req) ? {} : { ownerId: (req.importUser || {})._id };
    const records = await VerificationRecord.find(filter)
      .sort({ createdAt: -1 })
      .select("-result")
      .lean();
    return res.json({ success: true, data: records });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /records/:id — full saved report (owner or Super Admin only).
const getRecord = async (req, res) => {
  try {
    const record = await VerificationRecord.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ success: false, message: "Verification record not found." });
    if (!canAccess(req, record)) return res.status(403).json({ success: false, message: "Not authorized to view this record." });
    return res.json({ success: true, data: record });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /records/:id — Super Admin only (enforced by route middleware too).
const deleteRecord = async (req, res) => {
  try {
    const record = await VerificationRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "Verification record not found." });
    return res.json({ success: true, message: "Verification record deleted." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { startComparison, getComparisonStatus, getStatus, saveRecord, listRecords, getRecord, deleteRecord };
