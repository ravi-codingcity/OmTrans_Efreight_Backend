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
  // gemini-2.5-flash is fast, reliable and very capable for structured document
  // comparison — a good default so background jobs finish quickly. For maximum
  // reasoning accuracy set GEMINI_VERIFY_MODEL=gemini-2.5-pro (the async job pattern
  // means even a slow model no longer causes gateway timeouts).
  model: process.env.GEMINI_VERIFY_MODEL || "gemini-2.5-flash",
  mockMode: !process.env.GEMINI_API_KEY,

  maxFileSizeMb: num("VERIFY_MAX_FILE_SIZE_MB", 15),
  maxSystemDocs: num("VERIFY_MAX_SYSTEM_DOCS", 8),

  // Hard timeout for a single AI comparison. Keep below the hosting proxy's
  // gateway timeout so the API always returns a clean JSON error (with CORS
  // headers) instead of the proxy's header-less 504 page.
  aiTimeoutMs: num("VERIFY_AI_TIMEOUT_MS", 110000),
};

module.exports = { geminiConfig };
