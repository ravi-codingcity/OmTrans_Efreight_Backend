const { OUTPUT_TEMPLATES, DEFAULT_OUTPUT_TEMPLATE } = require("../utils/constants");

// Consolidated Shipment Information Report — field list per the spec.
const SHIPMENT_REPORT_TEMPLATE = {
  id: OUTPUT_TEMPLATES.SHIPMENT_REPORT,
  label: "Shipment Information Report",
  description: "Consolidated, normalized shipment data with multi-value tables, conflicts and missing-field sections.",
  documentTitle: "CONSOLIDATED SHIPMENT INFORMATION REPORT",
  summaryFields: [
    { label: "Shipper / Exporter", key: "exporter", composite: ["exporter_name", "exporter_address"], joiner: "\n", source: "shipping_bill" },
    { label: "Consignee", key: "consignee", composite: ["consignee_name", "consignee_address"], joiner: "\n" },
    { label: "Notify Party", key: "notify_party", composite: ["notify_party", "notify_party_address"], joiner: "\n", wide: true },
    { label: "Pre-Carriage By", key: "pre_carriage_by" },
    { label: "Ocean Vessel / Voyage No. / Flag", key: "ocean_vessel_voyage_flag", composite: ["vessel_name", "voyage_number", "vessel_flag"] },
    { label: "Place of Receipt", key: "place_of_receipt", source: "booking" },
    { label: "Port of Loading (POL)", key: "port_of_loading", source: "booking" },
    { label: "Port of Discharge (POD)", key: "port_of_discharge", source: "booking" },
    { label: "Place of Delivery", key: "place_of_delivery", source: "booking" },
    { label: "Final Destination (For Merchant Reference Only)", key: "final_destination" },
    { label: "Marks & Numbers", key: "marks_and_numbers", blank: true },
    { label: "Gross Measurement (CBM)", key: "gross_measurement", blank: true },
  ],
};

const OUTPUT_TEMPLATE_LIST = [
  { id: SHIPMENT_REPORT_TEMPLATE.id, label: SHIPMENT_REPORT_TEMPLATE.label, description: SHIPMENT_REPORT_TEMPLATE.description, isDefault: true },
];

const isValidTemplate = (id) => OUTPUT_TEMPLATE_LIST.some((t) => t.id === id);
const resolveTemplate = (id) => (isValidTemplate(id) ? id : DEFAULT_OUTPUT_TEMPLATE);

module.exports = { SHIPMENT_REPORT_TEMPLATE, OUTPUT_TEMPLATE_LIST, isValidTemplate, resolveTemplate };
