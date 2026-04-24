const mongoose = require("mongoose");

const rateFilingSchema = new mongoose.Schema(
  {
    // Creator
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    // Port / Route Info
    por: {
      type: String,
      required: [true, "Port of Receipt is required"],
      trim: true,
    },
    pol: {
      type: String,
      required: [true, "Port of Loading is required"],
      trim: true,
    },
    pod: {
      type: String,
      required: [true, "Port of Discharge is required"],
      trim: true,
    },
    fdrr: {
      type: String,
      default: "",
      trim: true,
    },
    route: {
      type: String,
      default: "",
      trim: true,
    },
    transit: {
      type: String,
      default: "",
      trim: true,
    },

    // Shipping Line & Container
    shipping_lines: {
      type: String,
      required: [true, "Shipping line is required"],
      trim: true,
    },
    // Legacy single container (kept for backward compat; populated from first of container_types)
    container_type: {
      type: String,
      default: "",
      trim: true,
    },
    // Multi-container support
    container_types: {
      type: [String],
      default: [],
    },
    // Per-container charges: { "20ft Standard Container": { ocean_freight, ocean_freight_currency, acd_type, acd_currency, acd_value } }
    containerCharges: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Freight & Charges
    // Legacy single ocean_freight (backward compat; populated from first container)
    ocean_freight: {
      type: String,
      default: "",
    },

    acd_ens_afr: {
      type: String,
      default: "",
    },
    bl_fees: {
      type: String,
      default: "",
    },
    thc: {
      type: String,
      default: "",
    },
    muc: {
      type: String,
      default: "",
    },
    toll: {
      type: String,
      default: "",
    },
    railFreightRates: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Custom Charges
    customLabel: {
      type: String,
      default: "",
    },
    customValue: {
      type: String,
      default: "",
    },
    customUnit: {
      type: String,
      default: "",
    },
    customCharges: {
      type: String,
      default: "",
    },

    // Commodity
    commodity: {
      type: String,
      required: [true, "Commodity is required"],
      trim: true,
    },

    // Shipping Contact
    shipping_name: {
      type: String,
      default: "",
      trim: true,
    },
    shipping_number: {
      type: String,
      default: "",
      trim: true,
    },
    shipping_email: {
      type: String,
      default: "",
      trim: true,
    },
    shipping_address: {
      type: String,
      default: "",
      trim: true,
    },

    // Validity
    validity: {
      type: String,
      required: [true, "Validity is required"],
    },
    validity_for: {
      type: String,
      default: "",
      trim: true,
    },

    // Remarks
    remarks: {
      type: String,
      default: "",
    },

    // Created By (User reference)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Index for common queries
rateFilingSchema.index({ name: 1 });
rateFilingSchema.index({ pol: 1, pod: 1 });
rateFilingSchema.index({ shipping_lines: 1 });
rateFilingSchema.index({ createdAt: -1 });

module.exports = mongoose.model("RateFiling", rateFilingSchema);
