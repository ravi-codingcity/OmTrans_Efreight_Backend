const mongoose = require("mongoose");
const { JOB_STATUS, OUTPUT_TEMPLATES, DEFAULT_OUTPUT_TEMPLATE } = require("../utils/constants");

const fieldComparisonSchema = new mongoose.Schema(
  {
    field: String,
    status: { type: String, enum: ["match", "conflict", "missing", "single_source"] },
    consolidatedValue: mongoose.Schema.Types.Mixed,
    sources: [
      {
        documentId: { type: mongoose.Schema.Types.ObjectId, ref: "AiDocument" },
        documentName: String,
        value: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    // Owner references the EXISTING User collection (reused, no duplicate model).
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jobNumber: { type: String, required: true, trim: true, maxlength: 200, index: true },
    hblNumber: { type: String, trim: true, index: true },
    location: { type: String, trim: true },

    aiModel: { type: String },
    aiModelUsed: { type: String },

    aiUsage: {
      model: String,
      analyses: { type: Number, default: 0 },
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      costUsd: { type: Number, default: 0 },
    },

    status: { type: String, enum: Object.values(JOB_STATUS), default: JOB_STATUS.UPLOADING, index: true },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    statusMessage: { type: String, default: "Queued" },

    documents: [{ type: mongoose.Schema.Types.ObjectId, ref: "AiDocument" }],

    consolidated: {
      fields: { type: mongoose.Schema.Types.Mixed, default: {} },
      comparison: [fieldComparisonSchema],
      discrepancies: [{ type: mongoose.Schema.Types.Mixed }],
      missingFields: [String],
      summary: { type: String },
      validationScore: { type: Number, min: 0, max: 100 },
    },

    report: { generatedAt: Date, pdfPath: String, docxPath: String },

    outputTemplate: { type: String, enum: Object.values(OUTPUT_TEMPLATES), default: DEFAULT_OUTPUT_TEMPLATE },

    shipmentReport: {
      pdfPath: String,
      docxPath: String,
      data: { type: mongoose.Schema.Types.Mixed },
      aiData: { type: mongoose.Schema.Types.Mixed },
      generated: { type: Boolean, default: false },
      generatedAt: Date,
      savedAt: Date,
    },

    mbl: {
      pdfPath: String,
      docxPath: String,
      data: { type: mongoose.Schema.Types.Mixed },
      generated: { type: Boolean, default: false },
      generatedAt: Date,
      savedAt: Date,
    },

    isf: {
      pdfPath: String,
      docxPath: String,
      data: { type: mongoose.Schema.Types.Mixed },
      generated: { type: Boolean, default: false },
      generatedAt: Date,
      savedAt: Date,
    },

    analysis: { type: mongoose.Schema.Types.Mixed },

    error: { type: String },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

jobSchema.index({ owner: 1, createdAt: -1 });

// Registered as "AiJob" so it never collides with existing app models.
module.exports = { Job: mongoose.model("AiJob", jobSchema) };
