const JOB_STATUS = Object.freeze({
  UPLOADING: "uploading",
  ANALYZING: "analyzing",
  GENERATING: "generating",
  COMPLETED: "completed",
  FAILED: "failed",
});

const DOC_STATUS = Object.freeze({
  PENDING: "pending",
  EXTRACTING: "extracting",
  EXTRACTED: "extracted",
  FAILED: "failed",
});

// Recognised export document types the AI is asked to classify into.
const DOC_TYPES = Object.freeze([
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "shipping_instruction", // Shipping Instruction / Bill of Lading Instructions (high-priority source)
  "certificate_of_origin",
  "letter_of_credit",
  "shipping_bill",
  "booking_confirmation",
  "forwarding_note",
  "form_10",
  "egate",
  "clp", // Container Load Plan — carries Agent Seal No. + Custom Seal No.
  "purchase_order",
  "insurance_certificate",
  "unknown",
]);

// Canonical fields cross-referenced across documents for validation.
const CANONICAL_FIELDS = Object.freeze([
  "exporter_name", "consignee_name", "invoice_number", "invoice_date", "po_number",
  "lc_number", "port_of_loading", "port_of_discharge", "country_of_origin",
  "country_of_destination", "incoterms", "currency", "total_quantity",
  "total_gross_weight", "total_net_weight", "total_value", "number_of_packages",
  "hs_code", "vessel_name", "container_number",
  // Sea Waybill / Bill of Lading specific
  "notify_party", "notify_party_address", "booking_number", "sea_waybill_number",
  "export_references", "forwarding_agent_reference", "pre_carriage_by",
  "place_of_receipt", "voyage_number", "vessel_flag", "place_of_delivery",
  "final_destination", "type_of_movement", "seal_number", "marks_and_numbers",
  "description_of_goods", "gross_measurement", "service_contract_number",
  "doc_form_number", "commodity_code", "exchange_rate", "date_cargo_received",
  "date_laden_on_board", "place_of_bill_issue", "bill_issue_date", "signed_by",
  "agent_for",
  // Shipping Bill / customs + booking
  "shipping_bill_number", "shipping_bill_date", "iec_number", "exporter_address",
  "consignee_address", "container_size", "number_of_containers",
  "vessel_etd", "vessel_eta",
  // Shipping Instruction specific
  "freight", "liner_seal_number", "customs_seal_number",
  // CLP (Container Load Plan)
  "agent_seal_number",
]);

const OUTPUT_TEMPLATES = Object.freeze({
  CONSOLIDATED_REPORT: "consolidated_report",
  SEA_WAYBILL: "sea_waybill",
  SHIPMENT_REPORT: "shipment_report",
});
const DEFAULT_OUTPUT_TEMPLATE = OUTPUT_TEMPLATES.SHIPMENT_REPORT;

const ALLOWED_MIME = Object.freeze({
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/tiff": "tiff",
});

module.exports = {
  JOB_STATUS, DOC_STATUS, DOC_TYPES, CANONICAL_FIELDS,
  OUTPUT_TEMPLATES, DEFAULT_OUTPUT_TEMPLATE, ALLOWED_MIME,
};
