const multer = require("multer");
const { geminiConfig } = require("../config/geminiConfig");

/* ------------------------------------------------------------------ */
/*  In-memory PDF upload for AI verification.                          */
/*  Files are kept in memory only (sent straight to Gemini as base64)  */
/*  and never persisted to disk — nothing to clean up.                 */
/* ------------------------------------------------------------------ */
function fileFilter(_req, file, cb) {
  const isPdf = file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname || "");
  if (isPdf) return cb(null, true);
  cb(new Error(`Only PDF files are supported (rejected: ${file.originalname})`));
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: geminiConfig.maxFileSizeMb * 1024 * 1024,
    files: geminiConfig.maxSystemDocs + 1, // system docs + 1 checklist
  },
});

// Accept a single "checklist" file and up to N "systemDocs" files.
const uploadVerificationDocs = upload.fields([
  { name: "checklist", maxCount: 1 },
  { name: "systemDocs", maxCount: geminiConfig.maxSystemDocs },
]);

module.exports = { uploadVerificationDocs };
