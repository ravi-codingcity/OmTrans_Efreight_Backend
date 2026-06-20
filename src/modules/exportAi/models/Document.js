const mongoose = require("mongoose");
const { DOC_STATUS, DOC_TYPES } = require("../utils/constants");

/**
 * One uploaded source file within a job. Raw bytes are NOT persisted — they live
 * on disk only during processing and are deleted afterwards.
 */
const documentSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: "AiJob", required: true, index: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    extension: { type: String },
    sizeBytes: { type: Number, required: true },
    checksum: { type: String },

    status: { type: String, enum: Object.values(DOC_STATUS), default: DOC_STATUS.PENDING },
    detectedType: { type: String, enum: DOC_TYPES, default: "unknown" },
    confidence: { type: Number, min: 0, max: 1, default: 0 },

    extractedFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    rawExtraction: { type: mongoose.Schema.Types.Mixed, default: {} },

    error: { type: String },
    fileDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Registered as "AiDocument" to avoid any collision with existing models.
module.exports = { Document: mongoose.model("AiDocument", documentSchema) };
