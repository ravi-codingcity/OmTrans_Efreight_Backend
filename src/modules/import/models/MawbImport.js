const mongoose = require("mongoose");

/* ------------------------------------------------------------------ */
/*  MAWB Import (AWB Instruction) schema                               */
/*  Isolated Import-module model. Mirrors the OmTrans "AWB INSTRUCTION"*/
/*  document format. Does NOT touch any existing collection.          */
/* ------------------------------------------------------------------ */

const shipperSchema = new mongoose.Schema(
  {
    company_name: { type: String, default: "", trim: true },
    address_line_1: { type: String, default: "", trim: true },
    address_line_2: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    postal_code: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    fax: { type: String, default: "", trim: true },
    contact_person: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const consigneeSchema = new mongoose.Schema(
  {
    company_name: { type: String, default: "", trim: true },
    address_line_1: { type: String, default: "", trim: true },
    address_line_2: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    postal_code: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    contact_person: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const notifyPartySchema = new mongoose.Schema(
  {
    company_name: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    email: { type: String, default: "", trim: true },
    contact_person: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const airlineInformationSchema = new mongoose.Schema(
  {
    airline_name: { type: String, default: "", trim: true },
    mawb_number: { type: String, default: "", trim: true },
    // PP = Prepaid, CC = Collect (matches "FREIGHT: PP" in the AWB format)
    freight_payment: { type: String, default: "PP", trim: true },
    iata_agent_code: { type: String, default: "", trim: true },
    account_number: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const routingLegSchema = new mongoose.Schema(
  {
    from: { type: String, default: "", trim: true },
    to: { type: String, default: "", trim: true },
    carrier: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const routingInformationSchema = new mongoose.Schema(
  {
    airport_of_departure: { type: String, default: "", trim: true },
    departure_airport_code: { type: String, default: "", trim: true },
    airport_of_destination: { type: String, default: "", trim: true },
    destination_airport_code: { type: String, default: "", trim: true },
    first_carrier: { type: String, default: "", trim: true },
    routing: { type: [routingLegSchema], default: [] },
    flight_number: { type: String, default: "", trim: true },
    flight_date: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const valuationInformationSchema = new mongoose.Schema(
  {
    currency: { type: String, default: "INR", trim: true },
    charges_code: { type: String, default: "", trim: true },
    declared_value_for_carriage: { type: String, default: "", trim: true },
    declared_value_for_customs: { type: String, default: "", trim: true },
    insurance_amount: { type: String, default: "", trim: true },
    insurance_currency: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const dimensionSchema = new mongoose.Schema(
  {
    length_cm: { type: Number, default: 0 },
    width_cm: { type: Number, default: 0 },
    height_cm: { type: Number, default: 0 },
    pieces: { type: Number, default: 0 },
  },
  { _id: false }
);

const shipmentDetailsSchema = new mongoose.Schema(
  {
    hawb_numbers: { type: [String], default: [] },
    total_packages: { type: Number, default: 0 },
    gross_weight: { type: Number, default: 0 },
    chargeable_weight: { type: Number, default: 0 },
    commodity_item_number: { type: String, default: "", trim: true },
    rate_per_kg: { type: Number, default: 0 },
    total_freight_charge: { type: Number, default: 0 },
    nature_of_goods: { type: String, default: "", trim: true },
    dimensions: { type: [dimensionSchema], default: [] },
    volume_cbm: { type: Number, default: 0 },
  },
  { _id: false }
);

const chargesSchema = new mongoose.Schema(
  {
    prepaid_collect: { type: String, default: "PREPAID", trim: true },
    valuation_charge: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    other_charges_due_agent: { type: Number, default: 0 },
    other_charges_due_carrier: { type: Number, default: 0 },
    total_prepaid: { type: Number, default: 0 },
    total_collect: { type: Number, default: 0 },
    currency_conversion_rate: { type: Number, default: 0 },
    collect_charges_destination_currency: { type: Number, default: 0 },
  },
  { _id: false }
);

const shipperDeclarationSchema = new mongoose.Schema(
  {
    place: { type: String, default: "", trim: true },
    execution_date: { type: String, default: "", trim: true },
    authorized_signatory: { type: String, default: "", trim: true },
    signature: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const mawbImportSchema = new mongoose.Schema(
  {
    shipper: { type: shipperSchema, default: () => ({}) },
    consignee: { type: consigneeSchema, default: () => ({}) },
    notify_party: { type: notifyPartySchema, default: () => ({}) },
    airline_information: { type: airlineInformationSchema, default: () => ({}) },
    routing_information: { type: routingInformationSchema, default: () => ({}) },
    valuation_information: { type: valuationInformationSchema, default: () => ({}) },
    shipment_details: { type: shipmentDetailsSchema, default: () => ({}) },
    charges: { type: chargesSchema, default: () => ({}) },
    shipper_declaration: { type: shipperDeclarationSchema, default: () => ({}) },

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
  {
    timestamps: true,
  }
);

// Common query helpers
mawbImportSchema.index({ createdBy: 1 });
mawbImportSchema.index({ status: 1 });
mawbImportSchema.index({ createdAt: -1 });
mawbImportSchema.index({ "airline_information.mawb_number": 1 });

module.exports = mongoose.model("MawbImport", mawbImportSchema);
