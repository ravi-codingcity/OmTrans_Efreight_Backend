const { geminiConfig } = require("../config/geminiConfig");

/* ------------------------------------------------------------------ */
/*  Validate the uploaded verification payload.                       */
/*  Requires exactly one CHA Checklist PDF and at least one system PDF. */
/* ------------------------------------------------------------------ */
function validateVerificationUpload(files = {}) {
  const errors = [];
  const checklist = (files.checklist || [])[0];
  const systemDocs = files.systemDocs || [];

  if (!checklist) errors.push("Please upload the CHA Checklist PDF.");
  if (systemDocs.length === 0) errors.push("Please upload at least one system PDF document.");
  if (systemDocs.length > geminiConfig.maxSystemDocs) {
    errors.push(`You can upload at most ${geminiConfig.maxSystemDocs} system documents.`);
  }

  const notPdf = [checklist, ...systemDocs]
    .filter(Boolean)
    .filter((f) => f.mimetype !== "application/pdf" && !/\.pdf$/i.test(f.originalname || ""));
  if (notPdf.length) errors.push("All files must be PDF documents.");

  return { valid: errors.length === 0, errors, checklist, systemDocs };
}

module.exports = { validateVerificationUpload };
