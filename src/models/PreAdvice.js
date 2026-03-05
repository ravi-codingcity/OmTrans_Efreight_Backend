const mongoose = require("mongoose");

const chargeSchema = new mongoose.Schema(
  {
    charges: { type: String, default: "" },
    currency: { type: String, default: "USD" },
    buyingAmount: { type: Number, default: 0 },
    sellingAmount: { type: Number, default: 0 },
    unit: { type: String, default: "Per Container" },
  },
  { _id: false }
);

const preAdviceSchema = new mongoose.Schema(
  {
    // Shipment
    jobNo: { type: String, required: [true, "Job number is required"] },
    dateOfBooking: { type: String, default: "" },
    shippingLine: { type: String, default: "" },
    bookedBy: { type: String, default: "" },
    routing: { type: String, default: "" },
    shipper: { type: String, default: "" },
    transitTime: { type: String, default: "" },
    equipmentSize: { type: String, default: "" },
    commodity: { type: String, default: "" },
    cargoWeight: { type: String, default: "" },
    forwarding: { type: String, default: "" },
    noOfContainers: { type: String, default: "" },
    cha: { type: String, default: "" },
    transportation: { type: String, default: "" },
    term: { type: String, default: "" },

    // Route
    por: { type: String, default: "" },
    pol: { type: String, default: "" },
    pod: { type: String, default: "" },
    finalDestination: { type: String, default: "" },

    // Customer
    customerName: { type: String, default: "" },
    customerAddress: { type: String, default: "" },

    // Consignee
    consigneeName: { type: String, default: "" },
    consigneeAddress: { type: String, default: "" },
    consigneeContact: { type: String, default: "" },
    consigneePhone: { type: String, default: "" },
    consigneeEmail: { type: String, default: "" },

    // Charges
    originCharges: { type: [chargeSchema], default: [] },
    freightCharges: { type: [chargeSchema], default: [] },
    destinationCharges: { type: [chargeSchema], default: [] },

    // DDP
    ddpBuying: { type: Number, default: 0 },
    ddpSelling: { type: Number, default: 0 },

    // Remarks
    remarks: { type: String, default: "" },

    // Shipping Line Contact
    slContactName: { type: String, default: "" },
    slContactEmail: { type: String, default: "" },
    slContactPhone: { type: String, default: "" },
    slContactDesignation: { type: String, default: "" },

    // Meta
    createdBy: { type: String, required: [true, "Created by is required"] },
  },
  { timestamps: true }
);

// Indexes for common queries
preAdviceSchema.index({ jobNo: 1 });
preAdviceSchema.index({ createdBy: 1 });
preAdviceSchema.index({ customerName: 1 });
preAdviceSchema.index({ shippingLine: 1 });
preAdviceSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PreAdvice", preAdviceSchema);
