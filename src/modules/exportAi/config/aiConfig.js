const path = require("node:path");
const { DEFAULT_MODEL } = require("./aiModels");

/* ------------------------------------------------------------------ */
/*  Export-AI module config                                           */
/*  Reuses the existing process env (JWT_SECRET, MONGODB_URI are owned */
/*  by the main app). The ONLY new variable is GEMINI_API_KEY. When it */
/*  is absent the module runs in deterministic MOCK mode (no external  */
/*  AI calls), so the pipeline is usable before the key is provided.   */
/* ------------------------------------------------------------------ */
const num = (key, fallback) => Number(process.env[key] ?? fallback);

const aiConfig = {
  isProd: process.env.NODE_ENV === "production",

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    mockMode: !process.env.GEMINI_API_KEY,
  },

  // Ephemeral working dirs (auto-created). Files are deleted after processing.
  uploadTmpDir: process.env.AI_UPLOAD_TMP_DIR || path.resolve(process.cwd(), "storage/tmp"),
  reportDir: process.env.AI_REPORT_DIR || path.resolve(process.cwd(), "storage/reports"),

  maxFileSizeMb: num("AI_MAX_FILE_SIZE_MB", 25),
  maxFilesPerJob: num("AI_MAX_FILES_PER_JOB", 8),
  minFilesPerJob: num("AI_MIN_FILES_PER_JOB", 1),

  usdToInr: num("USD_TO_INR", 86),
};

module.exports = { aiConfig };
