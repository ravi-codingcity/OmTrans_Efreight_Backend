const { validateVerificationUpload } = require("../validation/verificationValidation");
const { compareChecklist, describeAiError } = require("../services/geminiCompareService");

/* ------------------------------------------------------------------ */
/*  AI Document Verification controller                               */
/*  POST /api/import/verification/compare                             */
/*  Compares a CHA Checklist PDF against one or more system PDFs.      */
/* ------------------------------------------------------------------ */
const compareDocuments = async (req, res) => {
  try {
    const { valid, errors, checklist, systemDocs } = validateVerificationUpload(req.files);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const result = await compareChecklist(checklist, systemDocs);
    return res.json({ success: true, data: result });
  } catch (error) {
    const message = describeAiError(error);
    // eslint-disable-next-line no-console
    console.error("[DocVerify] compare failed:", error && error.message);
    return res.status(502).json({ success: false, message });
  }
};

// Lightweight status endpoint for the UI (does AI run live or in mock mode?).
const getStatus = (_req, res) => {
  const { geminiConfig } = require("../config/geminiConfig");
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

module.exports = { compareDocuments, getStatus };
