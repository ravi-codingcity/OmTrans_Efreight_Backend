const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      default: "",
      trim: true,
    },
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },
    companyAddress: {
      type: String,
      default: "",
      trim: true,
    },
    contactPersonName: {
      type: String,
      default: "",
      trim: true,
    },
    personDesignation: {
      type: String,
      default: "",
      trim: true,
    },
    contactNumber: {
      type: String,
      default: "",
      trim: true,
    },
    personEmail: {
      type: String,
      default: "",
      trim: true,
    },
    remarks: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
agentSchema.index({ country: 1 });
agentSchema.index({ companyName: 1 });
agentSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Agent", agentSchema);
