const { SHIPMENT_REPORT_TEMPLATE } = require("../config/templates");
const { isPriorityDoc } = require("./comparison.service");

const FIELD_LABELS = {
  port_of_discharge: "Port of Discharge (POD)",
  port_of_loading: "Port of Loading (POL)",
  total_gross_weight: "Gross Weight",
  gross_measurement: "Gross Measurement (CBM)",
  number_of_packages: "Packages",
  hs_code: "HS / HSN Code",
};
const prettyLabel = (f = "") => FIELD_LABELS[f] || f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const norm = (v) => String(v == null ? "" : v).toLowerCase().replace(/[\s,]+/g, " ").replace(/[^\w. ]+/g, "").trim();

const RELEVANT = new Set([
  ...SHIPMENT_REPORT_TEMPLATE.summaryFields.flatMap((f) => f.composite || f.pairKeys || [f.key]),
  "number_of_packages", "total_gross_weight", "description_of_goods", "hs_code",
  "container_number", "seal_number", "container_size", "shipping_bill_number",
  "shipping_bill_date", "iec_number", "invoice_number",
]);

/** In-application analysis (source mapping, primary source, conflicts). Dashboard-only. */
function buildAnalysis(consolidated = {}, documents = []) {
  const comparison = consolidated.comparison || [];
  const priorityIds = new Set(documents.filter(isPriorityDoc).map((d) => String(d._id)));
  const isPrioritySource = (s) => priorityIds.has(String(s.documentId));

  const documentsAnalyzed = documents.map((d) => ({
    name: d.originalName,
    type: (d.detectedType || "unknown").replace(/_/g, " "),
    status: d.status,
    isPrimary: isPriorityDoc(d),
    fieldCount: Object.values(d.extractedFields || {}).filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length,
  }));
  const primarySources = documentsAnalyzed.filter((d) => d.isPrimary).map((d) => d.name);

  const fieldSources = [];
  const conflicts = [];
  const missing = [];

  for (const c of comparison) {
    if (!RELEVANT.has(c.field)) continue;
    const label = prettyLabel(c.field);
    if (c.status === "missing") { missing.push(label); continue; }

    const sources = (c.sources || []).map((s) => ({ document: s.documentName, value: s.value, primary: isPrioritySource(s) }));
    const distinct = [...new Set((c.sources || []).map((s) => norm(s.value)))];
    const prioritySrc = sources.find((s) => s.primary);

    let selectedFrom = null;
    let reason = "";
    if (prioritySrc) {
      selectedFrom = prioritySrc.document;
      reason = "Taken from Shipping Bill / primary source (overrides other documents)";
    } else if (sources.length === 1) {
      selectedFrom = sources[0].document;
      reason = "Only available source";
    } else if (distinct.length === 1) {
      reason = "Consistent across all documents";
    } else {
      const winner = sources.find((s) => norm(s.value) === norm(c.consolidatedValue));
      selectedFrom = (winner && winner.document) || null;
      reason = "Majority value across documents";
    }

    fieldSources.push({ field: label, value: c.consolidatedValue, sources, selectedFrom, reason, conflict: distinct.length > 1 });
    if (distinct.length > 1) conflicts.push({ field: label, values: sources, resolvedTo: c.consolidatedValue, reason });
  }

  const perDocument = documents.map((d) => {
    const fields = {};
    for (const [k, v] of Object.entries(d.extractedFields || {})) {
      if (RELEVANT.has(k) && v !== null && v !== undefined && String(v).trim() !== "") fields[prettyLabel(k)] = String(v);
    }
    return {
      name: d.originalName,
      type: (d.detectedType || "unknown").replace(/_/g, " "),
      isPrimary: isPriorityDoc(d),
      fields,
      hsCodes: (d.rawExtraction && d.rawExtraction.hsCodes) || [],
      seals: (d.rawExtraction && d.rawExtraction.seals) || [],
      containerCount: ((d.rawExtraction && d.rawExtraction.containers) || []).length,
    };
  });

  return { documentsAnalyzed, primarySources, fieldSources, conflicts, missing, perDocument };
}

module.exports = { buildAnalysis };
