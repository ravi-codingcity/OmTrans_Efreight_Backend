const express = require("express");
const multer = require("multer");
const { authenticate, importAccess } = require("../../middleware/importAuth");
const { uploadVerificationDocs } = require("../middleware/upload");
const { compareDocuments, getStatus } = require("../controllers/verificationController");

const router = express.Router();

// All verification routes require a valid token + Import / Super Admin role.
router.use(authenticate, importAccess);

router.get("/status", getStatus);

// Wrap multer so its errors (file too large / too many / wrong type) become
// clean JSON responses instead of unhandled exceptions.
router.post(
  "/compare",
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
