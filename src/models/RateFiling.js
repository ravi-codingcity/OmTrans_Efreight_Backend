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
      default: "",
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
      default: "",
      trim: true,
    },
    container_type: {
      type: String,
      default: "",
      trim: true,
    },

    // Freight & Charges
    ocean_freight: {
      type: String,
      default: "",
    },
    ocean_freight_currency: {
      type: String,
      default: "USD",
      trim: true,
    },
    acd_ens_afr_type: {
      type: String,
      enum: ["ACD", "ENS", "AFR"],
      default: "ACD",
    },
    acd_ens_afr_value: {
      type: String,
      default: "",
    },
    acd_ens_afr_currency: {
      type: String,
      default: "USD",
      trim: true,
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

    // Commodity
    commodity: {
      type: String,
      default: "",
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
      default: "",
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
