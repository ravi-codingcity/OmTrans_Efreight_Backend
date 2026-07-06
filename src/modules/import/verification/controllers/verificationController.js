const { validateVerificationPayload } = require("../validation/verificationValidation");
const { compareChecklist, describeAiError } = require("../services/geminiCompareService");

/* ------------------------------------------------------------------ */
/*  AI Document Verification controller                               */
/*  POST /api/import/verification/compare                             */
/*  Compares a CHA Checklist PDF against one or more system PDFs.      */
/* ------------------------------------------------------------------ */
const compareDocuments = async (req, res) => {
  const started = Date.now();
  try {
    const { valid, errors, checklist, systemDocs } = validateVerificationPayload(req.body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const totalMb = [checklist, ...systemDocs].reduce((n, f) => n + (f.size || 0), 0) / 1048576;
    // eslint-disable-next-line no-console
    console.log(`[DocVerify] compare start — checklist="${checklist.originalname}", systemDocs=${systemDocs.length}, size=${totalMb.toFixed(1)}MB`);

    const result = await compareChecklist(checklist, systemDocs);
    // eslint-disable-next-line no-console
    console.log(`[DocVerify] compare done in ${Date.now() - started}ms — match=${result.match}, score=${result.score}`);
    return res.json({ success: true, data: result });
  } catch (error) {
    const message = describeAiError(error);
    const isTimeout = /AI_TIMEOUT/i.test(String(error && error.message));
    // eslint-disable-next-line no-console
    console.error(`[DocVerify] compare failed after ${Date.now() - started}ms:`, error && error.message);
    // 504 for timeouts, 502 for other upstream AI failures — both carry our CORS headers.
    return res.status(isTimeout ? 504 : 502).json({ success: false, message });
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
