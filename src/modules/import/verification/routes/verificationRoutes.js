const express = require("express");
const multer = require("multer");
const { authenticate, importAccess } = require("../../middleware/importAuth");
const { uploadVerificationDocs } = require("../middleware/upload");
const { geminiConfig } = require("../config/geminiConfig");
const { compareDocuments, getStatus } = require("../controllers/verificationController");

const router = express.Router();

// All verification routes require a valid token + Import / Super Admin role.
router.use(authenticate, importAccess);

router.get("/status", getStatus);

// Give the AI comparison enough socket time so Node itself never times out before
// our own aiTimeoutMs returns a clean JSON error.
const allowLongRequest = (req, res, next) => {
  const ms = geminiConfig.aiTimeoutMs + 30000;
  if (req.setTimeout) req.setTimeout(ms);
  if (res.setTimeout) res.setTimeout(ms);
  next();
};

// Wrap multer so its errors (file too large / too many / wrong type) become
// clean JSON responses instead of unhandled exceptions.
router.post(
  "/compare",
  allowLongRequest,
  (req, res, next) =>
    uploadVerificationDocs(req, res, (err) => {
      if (!err) return next();
      const message =
        err instanceof multer.MulterError
          ? (err.code === "LIMIT_FILE_SIZE"
              ? "A file exceeds the maximum allowed size."
              : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
              ? "Too many files uploaded."
              : err.message)
          : err.message || "File upload failed";
      return res.status(400).json({ success: false, message });
    }),
  compareDocuments
);

module.exports = router;
