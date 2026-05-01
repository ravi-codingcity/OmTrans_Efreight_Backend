const mongoose = require("mongoose");

const shippingLineSchema = new mongoose.Schema(
  {
    lineName: {
      type: String,
      required: [true, "Shipping line name is required"],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const destinationSchema = new mongoose.Schema(
  {
    destinationName: {
      type: String,
      required: [true, "Destination name is required"],
      trim: true,
      unique: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    shippingLines: {
      type: [shippingLineSchema],
      default: [],
    },
  },
  { timestamps: true }
);

destinationSchema.index({ destinationName: 1 });

module.exports = mongoose.model("Destination", destinationSchema);
