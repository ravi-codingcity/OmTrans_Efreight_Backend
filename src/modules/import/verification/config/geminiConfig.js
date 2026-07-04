/* ------------------------------------------------------------------ */
/*  AI Document Verification — Gemini config (self-contained)          */
/*                                                                      */
/*  Isolated from every other module. The ONLY external requirement is  */
/*  GEMINI_API_KEY. When it is absent the module runs in MOCK mode so   */
/*  the feature is usable/testable before a key is provisioned.         */
/* ------------------------------------------------------------------ */
const num = (key, fallback) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : fallback;
};

const geminiConfig = {
  apiKey: process.env.GEMINI_API_KEY || "",
  model: process.env.GEMINI_VERIFY_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
  mockMode: !process.env.GEMINI_API_KEY,

  maxFileSizeMb: num("VERIFY_MAX_FILE_SIZE_MB", 15),
  maxSystemDocs: num("VERIFY_MAX_SYSTEM_DOCS", 8),
};

module.exports = { geminiConfig };
