const mongoose = require("mongoose");

/* ------------------------------------------------------------------ */
/*  AI Document Verification record (saved comparison report).        */
/*  Isolated to the verification module — independent of MAWB/HAWB.    */
/* ------------------------------------------------------------------ */
const verificationRecordSchema = new mongoose.Schema(
  {
    // Uploaded document references
    checklistFileName: { type: String, default: "", trim: true },
    systemDocuments: [{ type: String }],

    // The full AI comparison report (dashboard, header, items, SIMS, etc.)
    result: { type: mongoose.Schema.Types.Mixed },

    // Denormalized summary (for the list page / filtering)
    verificationStatus: { type: String, enum: ["match", "mismatch"], default: "mismatch" },
    matchPercentage: { type: Number, default: 0 },
    matchedCount: { type: Number, default: 0 },
    unmatchedCount: { type: Number, default: 0 },
    missingCount: { type: Number, default: 0 },

    // Ownership / audit
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    createdBy: { type: String, default: "", trim: true },
    createdByRole: { type: String, default: "", trim: true },
    createdByLocation: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

verificationRecordSchema.index({ createdAt: -1 });

module.exports = mongoose.model("VerificationRecord", verificationRecordSchema);
