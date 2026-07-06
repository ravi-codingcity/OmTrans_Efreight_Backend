const { geminiConfig } = require("../config/geminiConfig");

/* ------------------------------------------------------------------ */
/*  Validate the verification JSON payload.                           */
/*  Shape: { checklist: {name, data(base64)}, systemDocs: [{name,data}] } */
/*  Requires one CHA Checklist PDF and at least one system PDF.        */
/* ------------------------------------------------------------------ */
const MAX_BYTES = () => geminiConfig.maxFileSizeMb * 1024 * 1024;

// Turn a { name, data(base64) } entry into the { originalname, mimetype, buffer, size }
// shape the comparison service expects. Returns null when data is missing/invalid.
function toDoc(entry) {
  if (!entry || typeof entry !== "object" || !entry.data) return null;
  let buffer;
  try {
    buffer = Buffer.from(String(entry.data), "base64");
  } catch {
    return null;
  }
  if (!buffer || buffer.length === 0) return null;
  return {
    originalname: String(entry.name || "document.pdf"),
    mimetype: "application/pdf",
    buffer,
    size: buffer.length,
  };
}

function validateVerificationPayload(body = {}) {
  const errors = [];
  const checklist = toDoc(body && body.checklist);
  const systemDocs = Array.isArray(body && body.systemDocs)
    ? body.systemDocs.map(toDoc).filter(Boolean)
    : [];

  if (!checklist) errors.push("Please upload the CHA Checklist PDF.");
  if (systemDocs.length === 0) errors.push("Please upload at least one system PDF document.");
  if (systemDocs.length > geminiConfig.maxSystemDocs) {
    errors.push(`You can upload at most ${geminiConfig.maxSystemDocs} system documents.`);
  }
  const oversize = [checklist, ...systemDocs].filter(Boolean).find((d) => d.size > MAX_BYTES());
  if (oversize) errors.push(`"${oversize.originalname}" exceeds ${geminiConfig.maxFileSizeMb} MB.`);

  return { valid: errors.length === 0, errors, checklist, systemDocs };
}

module.exports = { validateVerificationPayload };
