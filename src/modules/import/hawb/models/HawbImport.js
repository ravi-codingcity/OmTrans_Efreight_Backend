const mongoose = require("mongoose");

/* ------------------------------------------------------------------ */
/*  HAWB Import (House Air Waybill) schema                            */
/*                                                                    */
/*  Stores ONLY the user-fillable fields of the OmTrans HAWB          */
/*  template. Completely independent from the MAWB collection.        */
/* ------------------------------------------------------------------ */

const hawbImportSchema = new mongoose.Schema(
  {
    // Shipment Information
    airport_of_departure: { type: String, default: "", trim: true },
    airport_of_destination: { type: String, default: "", trim: true },
    master_awb_number: { type: String, default: "", trim: true },
    house_awb_number: { type: String, default: "", trim: true },

    // Parties
    shipper: { type: String, default: "", trim: true },
    consignee: { type: String, default: "", trim: true },
    notify: { type: String, default: "", trim: true },

    // Routing Information
    routing_airport_of_departure: { type: String, default: "", trim: true },
    routing_to: { type: String, default: "", trim: true },
    routing_airport_of_destination: { type: String, default: "", trim: true },

    // Shipment Details
    no_of_pieces: { type: String, default: "", trim: true },
    gross_weight: { type: String, default: "", trim: true },
    chargeable_weight: { type: String, default: "", trim: true },

    // Nature & Quantity of Goods — these combine into one template box
    nature_of_goods: { type: String, default: "", trim: true },
    invoice_no: { type: String, default: "", trim: true },
    invoice_date: { type: String, default: "", trim: true },
    hsn_code: { type: String, default: "", trim: true },
    dimension: { type: String, default: "", trim: true },
    volume_wt: { type: String, default: "", trim: true },

    // Final field — the "Dated" box
    dated: { type: String, default: "", trim: true },

    // Draft vs final submission
    status: { type: String, enum: ["draft", "submitted"], default: "draft" },

    // Metadata
    createdBy: { type: String, default: "", trim: true },
    createdByRole: { type: String, default: "", trim: true },
    createdByLocation: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

hawbImportSchema.index({ createdBy: 1 });
hawbImportSchema.index({ status: 1 });
hawbImportSchema.index({ createdAt: -1 });
hawbImportSchema.index({ house_awb_number: 1 });

module.exports = mongoose.model("HawbImport", hawbImportSchema);
