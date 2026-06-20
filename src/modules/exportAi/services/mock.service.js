const crypto = require("node:crypto");

/**
 * Deterministic mock extraction used when GEMINI_API_KEY is absent. Produces
 * plausible export-document data from the filename so the full upload → analyse
 * → compare → report pipeline is exercisable offline, with a couple of
 * deliberate per-document variations so the comparison engine surfaces conflicts.
 */
const GROUND_TRUTH = {
  exporter_name: "Oceanic Exports Pvt Ltd",
  consignee_name: "Continental Importers GmbH",
  invoice_number: "INV-2026-00871",
  invoice_date: "2026-05-18",
  po_number: "PO-44120",
  lc_number: "LC-DE-99231",
  port_of_loading: "Nhava Sheva (INNSA)",
  port_of_discharge: "Hamburg (DEHAM)",
  country_of_origin: "India",
  country_of_destination: "Germany",
  incoterms: "FOB",
  currency: "USD",
  total_quantity: "1,200 PCS",
  total_gross_weight: "5,420 KG",
  total_net_weight: "5,010 KG",
  total_value: "84,600.00",
  number_of_packages: "60",
  hs_code: "6109.10",
  vessel_name: "MV Northern Star",
  container_number: "MSKU-7741120",
};

const TYPE_KEYWORDS = [
  ["commercial_invoice", ["invoice", "commercial", "inv"]],
  ["packing_list", ["packing", "packlist", "pl"]],
  ["bill_of_lading", ["lading", "bol", "bl", "awb", "waybill"]],
  ["certificate_of_origin", ["origin", "coo", "certificate"]],
  ["letter_of_credit", ["credit", "loc", "lc"]],
  ["shipping_bill", ["shipping", "customs", "sb"]],
  ["purchase_order", ["purchase", "order", "po"]],
  ["insurance_certificate", ["insurance", "policy", "marine"]],
];

const TYPE_FIELDS = {
  commercial_invoice: ["exporter_name", "consignee_name", "invoice_number", "invoice_date", "po_number", "incoterms", "currency", "total_value", "hs_code", "country_of_origin"],
  packing_list: ["exporter_name", "consignee_name", "invoice_number", "total_quantity", "total_gross_weight", "total_net_weight", "number_of_packages"],
  bill_of_lading: ["exporter_name", "consignee_name", "port_of_loading", "port_of_discharge", "vessel_name", "container_number", "number_of_packages", "total_gross_weight"],
  certificate_of_origin: ["exporter_name", "consignee_name", "country_of_origin", "country_of_destination", "hs_code", "invoice_number"],
  letter_of_credit: ["lc_number", "exporter_name", "consignee_name", "currency", "total_value", "incoterms"],
  shipping_bill: ["exporter_name", "invoice_number", "hs_code", "port_of_loading", "total_value", "number_of_packages"],
  purchase_order: ["po_number", "consignee_name", "currency", "total_value", "incoterms"],
  insurance_certificate: ["exporter_name", "consignee_name", "total_value", "currency", "vessel_name"],
  unknown: ["exporter_name", "invoice_number", "total_value"],
};

function detectType(name) {
  const lower = name.toLowerCase();
  for (const [type, kws] of TYPE_KEYWORDS) if (kws.some((k) => lower.includes(k))) return type;
  return "unknown";
}

function hashInt(str) {
  return parseInt(crypto.createHash("md5").update(str).digest("hex").slice(0, 8), 16);
}

function buildMockExtraction({ originalName, mimeType }) {
  const detectedType = detectType(originalName);
  const seed = hashInt(originalName);
  const relevant = TYPE_FIELDS[detectedType] || TYPE_FIELDS.unknown;

  const fields = {};
  for (const key of relevant) {
    let value = GROUND_TRUTH[key];
    if (key === "total_value" && seed % 3 === 0) value = "84,060.00";
    if (key === "total_gross_weight" && seed % 4 === 0) value = "5,480 KG";
    if (key === "incoterms" && seed % 5 === 0) continue;
    fields[key] = value;
  }

  const isImage = mimeType && mimeType.startsWith("image/");
  return {
    detectedType,
    confidence: detectedType === "unknown" ? 0.55 : 0.92,
    fields,
    hsCodes: ["6109.10", "6105.10"],
    containers:
      seed % 2 === 0
        ? [{ containerNo: "MSKU-7741120", sealNo: "SL-99812", marks: "N/M", packages: "60" }]
        : [
            { containerNo: "MSKU-7741120", sealNo: "SL-99812", marks: "N/M", packages: "30" },
            { containerNo: "TCLU-5520341", sealNo: "SL-99813", marks: "N/M", packages: "30" },
          ],
    lineItems: [
      { description: "Cotton T-Shirts (Assorted)", quantity: "800 PCS", unitPrice: "6.50", amount: "5,200.00", hsCode: "6109.10" },
      { description: "Cotton Polo Shirts", quantity: "400 PCS", unitPrice: "8.20", amount: "3,280.00", hsCode: "6105.10" },
    ],
    notes:
      "[MOCK EXTRACTION — no Gemini key configured] " +
      (isImage ? "Simulated OCR of a scanned image. " : "") +
      `Classified as ${detectedType.replace(/_/g, " ")}.`,
  };
}

module.exports = { buildMockExtraction };
