const { validateVerificationPayload } = require("../validation/verificationValidation");
const { compareChecklist, describeAiError } = require("../services/geminiCompareService");
const { createJob, getJob, completeJob, failJob } = require("../services/jobStore");
const { geminiConfig } = require("../config/geminiConfig");

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

module.exports = { startComparison, getComparisonStatus, getStatus };
