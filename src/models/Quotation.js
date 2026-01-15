const mongoose = require('mongoose');

// Sub-schema for charges (origin, freight, destination)
const chargeSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
    },
    charges: {
      type: String,
      default: '',
    },
    currency: {
      type: String,
      default: 'USD',
    },
    amount: {
      type: String,
      default: '',
    },
    unit: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const quotationSchema = new mongoose.Schema(
  {
    // Quotation ID (e.g., "SELCL-091225-925")
    id: {
      type: String,
      required: [true, 'Quotation ID is required'],
      unique: true,
      trim: true,
    },

    // Quotation Segment Info
    quotationSegment: {
      type: String,
      required: [true, 'Quotation segment is required'],
      trim: true,
    },
    quotationSegmentPrefix: {
      type: String,
      default: '',
    },

    // User/Creator Info
    createdBy: {
      type: String,
      default: '',
    },
    createdByLocation: {
      type: String,
      default: '',
    },
    createdByRole: {
      type: String,
      default: '',
    },
    createdDate: {
      type: Date,
      default: Date.now,
    },

    // Customer & Consignee
    customerName: {
      type: String,
      default: '',
    },
    consigneeName: {
      type: String,
      default: '',
    },

    // Sea Freight Fields
    pol: {
      type: String,
      default: '',
    },
    pod: {
      type: String,
      default: '',
    },
    por: {
      type: String,
      default: '',
    },
    finalDestination: {
      type: String,
      default: '',
    },
    shippingLine: {
      type: String,
      default: '',
    },
    equipment: {
      type: String,
      default: '',
    },
    size: {
      type: String,
      default: '',
    },

    // Air Freight Fields
    airLines: {
      type: String,
      default: '',
    },
    airPortOfDeparture: {
      type: String,
      default: '',
    },
    airPortOfDestination: {
      type: String,
      default: '',
    },
    chargeableWeight: {
      type: String,
      default: '',
    },
    volumeWeight: {
      type: String,
      default: '',
    },

    // Cargo Details
    commodity: {
      type: String,
      default: '',
    },
    cargoSize: {
      type: String,
      default: '',
    },
    cbm: {
      type: String,
      default: '',
    },
    weight: {
      type: String,
      default: '',
    },
    numberOfPackets: {
      type: String,
      default: '',
    },

    // Shipment Details
    terms: {
      type: String,
      default: '',
    },
    etd: {
      type: String,
      default: '',
    },
     eta: {
      type: String,
      default: '',
    },
    transitTime: {
      type: String,
      default: '',
    },
    serviceJobType: {
      type: String,
      default: '',
    },

    // Charges Arrays
    originCharges: {
      type: [chargeSchema],
      default: [],
    },
    freightCharges: {
      type: [chargeSchema],
      default: [],
    },
    destinationCharges: {
      type: [chargeSchema],
      default: [],
    },

    // Additional Fields
    remarks: {
      type: String,
      default: '',
    },
    pdfFileName: {
      type: String,
      default: '',
    },

    // Terms & Conditions (array of selected terms)
    termsAndConditions: {
      type: [String],
      default: [],
    },

      // Rail ramps
    railRamps: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Quotation', quotationSchema);
