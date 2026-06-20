const multer = require("multer");
const path = require("node:path");
const { v4: uuid } = require("uuid");
const { aiConfig } = require("../config/aiConfig");
const { ALLOWED_MIME } = require("../utils/constants");
const { ensureDir, sanitizeFilename } = require("../utils/files");
const { ApiError } = require("../utils/ApiError");

// Each upload request gets an isolated temp folder so cleanup is trivial.
const storage = multer.diskStorage({
  destination(req, _file, cb) {
    if (!req.uploadBatchId) req.uploadBatchId = uuid();
    const dir = path.resolve(aiConfig.uploadTmpDir, req.uploadBatchId);
    ensureDir(dir);
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const safe = sanitizeFilename(file.originalname);
    cb(null, `${uuid()}__${safe}`);
  },
});

function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
  cb(ApiError.badRequest(`Unsupported file type: ${file.mimetype} (${file.originalname})`));
}

const uploadDocuments = multer({
  storage,
  fileFilter,
  limits: { fileSize: aiConfig.maxFileSizeMb * 1024 * 1024, files: aiConfig.maxFilesPerJob },
}).array("documents", aiConfig.maxFilesPerJob);

module.exports = { uploadDocuments };
