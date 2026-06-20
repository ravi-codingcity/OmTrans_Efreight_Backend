const { asyncHandler } = require("../utils/asyncHandler");
const { AI_MODELS, DEFAULT_MODEL } = require("../config/aiModels");
const { OUTPUT_TEMPLATE_LIST } = require("../config/templates");
const { DEFAULT_OUTPUT_TEMPLATE } = require("../utils/constants");
const { aiConfig } = require("../config/aiConfig");
const { verifyGemini } = require("../services/gemini.service");

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

module.exports = { listModels, listTemplates, checkModel };
