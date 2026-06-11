const mongoose = require("mongoose");

/* ------------------------------------------------------------------ */
/*  MAWB Import (AWB Instruction) schema                              */
/*                                                                    */
/*  Stores ONLY the user-fillable fields of the OmTrans "AWB          */
/*  INSTRUCTION" template. Every other box in the template is fixed   */
/*  text or intentionally left blank, so it is not stored here.       */
/*  Isolated Import-module model — touches no existing collection.    */
/* ------------------------------------------------------------------ */

const mawbImportSchema = new mongoose.Schema(
  {
    // Parties (free-text blocks, as they appear in the template boxes)
    shipper: { type: String, default: "", trim: true },
    consignee: { type: String, default: "", trim: true },
    notify: { type: String, default: "", trim: true },

    // Routing — "Airport of departure ... & requested routing"
    from_routing: { type: String, default: "", trim: true }, // FROM
    to_routing: { type: String, default: "", trim: true }, // TO

    // Accounting information
    freight: { type: String, default: "PP", trim: true }, // PP / CC
    hawb_nos: { type: String, default: "", trim: true },

    // Destination
    airport_of_destination: { type: String, default: "", trim: true },

    // Handling
    handling_information: { type: String, default: "", trim: true },

    // Shipment / rate line
    no_of_pcs: { type: String, default: "", trim: true },
    gross_weight: { type: String, default: "", trim: true },
    chargeable_weight: { type: String, default: "", trim: true },

    // Cargo — nature + HSN + dimensions all live in the single
    // "Nature & quantity of goods" box of the template.
    nature_of_goods: { type: String, default: "", trim: true },
    hsn_code: { type: String, default: "", trim: true },
    goods_dimension: { type: String, default: "", trim: true },

    // Date
    date: { type: String, default: "", trim: true },

    // Draft vs final submission
    status: {
      type: String,
      enum: ["draft", "submitted"],
      default: "draft",
    },

    // User / document metadata
    createdBy: { type: String, default: "", trim: true },
    createdByRole: { type: String, default: "", trim: true },
    createdByLocation: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

mawbImportSchema.index({ createdBy: 1 });
mawbImportSchema.index({ status: 1 });
mawbImportSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MawbImport", mawbImportSchema);
