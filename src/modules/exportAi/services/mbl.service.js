const { isPriorityDoc, isSupportingDoc, isShippingInstruction } = require("./comparison.service");

/**
 * Build the default MBL data from a finalized HBL record. The MBL format is nearly
 * identical to the HBL, so almost everything is copied verbatim — only the
 * Shipper/Consignee/Notify fields differ, plus the MBL Number (from the Booking No).
 */
const MBL_SHIPPER = "OmTrans Logistics Ltd, 159, Transport Center,Punjabi Bagh, New Delhi-110035, India";

const isEmptyVal = (v) => v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "Not Found";
const normKeyVal = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const docName = (d) => (d && d.originalName) || "document";

/**
 * Reference-only "Data Source Summary" for the consolidated MBL (Multiple LEO with
 * Multiple HBL). For each MBL field it lists the combined value and WHICH uploaded
 * document(s) it was extracted from. This is NOT written into any generated document.
 * Returns an array of { field, value, sources: [filename] }.
 */
function buildMblSourceSummary(documents = [], options = {}) {
  const name = docName;
  // LEO set = LEO / Shipping Bill / Indian Customs EDI only. CLP, Forwarding Note and
  // Form 13 are supporting documents and are never counted as LEOs (so Quantity /
  // Gross Weight and their Totals are derived exclusively from the LEO documents).
  const leoDocs = documents.filter((d) => isPriorityDoc(d) && !isSupportingDoc(d));
  const siDocs = documents.filter(isShippingInstruction);
  const bookingDocs = documents.filter((d) => d.detectedType === "booking_confirmation" || /booking/i.test(name(d)));
  const isMumbai = String(options.location || "").trim().toLowerCase() === "mumbai";
  const fwdDocs = documents.filter((d) => d.detectedType === "forwarding_note" || /forwarding/i.test(name(d)));
  const egateDocs = documents.filter((d) => ["egate", "form_10"].includes(d.detectedType) || /form[\s_-]*10|form10|e[\s-]?gate|sez[\s-]*4|form[\s_-]*13|form[\s_-]*6(?!\d)/i.test(name(d)));
  const clpDocs = documents.filter((d) => d.detectedType === "clp" || /\bclp\b|container\s*load\s*plan/i.test(name(d)));
  const sealDocs = isMumbai ? [...egateDocs, ...fwdDocs, ...clpDocs] : [...fwdDocs, ...egateDocs, ...clpDocs];

  const cleanSeal = (s) => String(s || "").replace(/^\s*(line\s*seal\s*no\.?|agent\s*seal\s*no\.?|carrier\s*seal\s*no\.?|customs?\s*seal\s*no\.?|cust\s*seal\s*no\.?|line\s*seal|agent\s*seal|customs?\s*seal|seal\s*no\.?|seal)\s*[:.#-]*\s*/i, "").trim();
  const isContainerNoVal = (v) => /^[A-Z]{4}\d{6,7}$/.test(normKeyVal(v));

  // Friendly, human-readable source label for each document (LEO 1, LEO 2, CLP, …)
  // with the filename kept for traceability.
  const leoLabel = new Map();
  leoDocs.forEach((d, i) => leoLabel.set(d, `LEO ${i + 1}`));
  const docType = (d) =>
    leoLabel.get(d) ||
    (bookingDocs.includes(d) ? "Booking Confirmation"
      : siDocs.includes(d) ? "Shipping Instruction"
      : clpDocs.includes(d) ? "CLP"
      : fwdDocs.includes(d) ? "Forwarding Note"
      : egateDocs.includes(d) ? "Form 13"
      : "Document");
  const srcName = (d) => { const t = docType(d); const f = name(d); return f && f !== t && f !== "document" ? `${t} (${f})` : t; };

  // Every row is one (field × source document): field name, the value extracted from
  // THAT document, the source document, and the field name as it appears there.
  const rows = [];
  const push = (field, value, source, sourceField) => { if (!isEmptyVal(value)) rows.push({ field, value: String(value).trim(), source, sourceField }); };

  // Per-document field: emits one row for EACH document that carries the value (so
  // both LEOs show up individually, e.g. Invoice Number → LEO 1, → LEO 2).
  const perDoc = (field, docs, key, sourceField) =>
    docs.forEach((d) => push(field, d.extractedFields && d.extractedFields[key], srcName(d), sourceField));

  const perDocGoods = (docs) =>
    docs.forEach((d) => {
      const items = ((d.rawExtraction && d.rawExtraction.lineItems) || []).map((li) => li.description).filter((v) => !isEmptyVal(v));
      const val = items.length ? items.join(", ") : (d.extractedFields && d.extractedFields.description_of_goods);
      push("Description of Goods", val, srcName(d), "Description of Goods");
    });
  const perDocHsn = (docs) =>
    docs.forEach((d) => {
      const codes = [];
      ((d.rawExtraction && d.rawExtraction.hsCodes) || []).forEach((c) => { if (!isEmptyVal(c) && !codes.includes(String(c).trim())) codes.push(String(c).trim()); });
      const hc = d.extractedFields && d.extractedFields.hs_code; if (!isEmptyVal(hc) && !codes.includes(String(hc).trim())) codes.push(String(hc).trim());
      push("HSN Code", codes.join(", "), srcName(d), "HSN Code");
    });
  const validContainersOf = (d) => {
    const out = [];
    ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => { if (isContainerNoVal(c.containerNo) && !out.some((x) => normKeyVal(x) === normKeyVal(c.containerNo))) out.push(String(c.containerNo).trim()); });
    const cf = d.extractedFields && d.extractedFields.container_number; if (isContainerNoVal(cf) && !out.some((x) => normKeyVal(x) === normKeyVal(cf))) out.push(String(cf).trim());
    return out;
  };
  const perDocSeals = (docs) =>
    docs.forEach((d) => {
      const seals = [];
      ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => [c.sealNo, c.linerSeal, c.agentSeal, c.customsSeal].forEach((s) => { const v = cleanSeal(s); if (!isEmptyVal(v) && !seals.some((x) => normKeyVal(x) === normKeyVal(v))) seals.push(v); }));
      ((d.rawExtraction && d.rawExtraction.seals) || []).forEach((s) => { const v = cleanSeal(s); if (!isEmptyVal(v) && !seals.some((x) => normKeyVal(x) === normKeyVal(v))) seals.push(v); });
      push("Seal Number(s)", seals.join(", "), srcName(d), "Seal No.");
    });

  // Sum a shipment-level numeric field across all LEOs (for the Total rows).
  const sumLeo = (key) => {
    let total = 0, unit = "", any = false;
    leoDocs.forEach((d) => {
      const raw = d.extractedFields && d.extractedFields[key];
      if (isEmptyVal(raw)) return;
      const m = String(raw).replace(/,/g, "").match(/([\d.]+)\s*([A-Za-z.]+)?/);
      if (!m) return; const n = parseFloat(m[1]); if (Number.isNaN(n)) return;
      total += n; any = true; if (!unit && m[2]) unit = m[2];
    });
    if (!any) return "";
    const numStr = Number.isInteger(total) ? String(total) : String(Math.round(total * 1000) / 1000);
    return unit ? `${numStr} ${unit}` : numStr;
  };

  // ---- Fixed / Booking-level fields (from the Booking Confirmation) ----
  rows.push({ field: "Shipper / Exporter", value: "OmTrans Logistics Ltd", source: "MBL format (fixed)", sourceField: "—" });
  perDoc("MBL Number (Booking No.)", bookingDocs, "booking_number", "Booking No.");
  perDoc("Place of Receipt", bookingDocs, "place_of_receipt", "Place of Receipt");
  perDoc("Port of Loading (POL)", bookingDocs, "port_of_loading", "Port of Loading");
  perDoc("Port of Discharge (POD)", bookingDocs, "port_of_discharge", "Port of Discharge");
  perDoc("Place of Delivery", bookingDocs, "place_of_delivery", "Place of Delivery");
  bookingDocs.forEach((d) => {
    const ef = d.extractedFields || {};
    const parts = [ef.vessel_name, ef.voyage_number, ef.vessel_flag].filter((x) => !isEmptyVal(x)).map(String);
    push("Vessel / Voyage / Flag", parts.join(" / "), srcName(d), "Vessel / Voyage / Flag");
  });
  perDoc("ETD", bookingDocs, "vessel_etd", "ETD");
  perDoc("ETA", bookingDocs, "vessel_eta", "ETA");

  // ---- Per-LEO shipment fields (one row per LEO / Shipping Bill / EDI) ----
  perDoc("Invoice Number", leoDocs, "invoice_number", "Invoice No.");
  perDoc("Invoice Date", leoDocs, "invoice_date", "Invoice Date");
  perDoc("Shipping Bill Number", leoDocs, "shipping_bill_number", "Shipping Bill No.");
  perDoc("Shipping Bill Date", leoDocs, "shipping_bill_date", "Shipping Bill Date");
  perDoc("IEC / BR Number", leoDocs, "iec_number", "IEC / BR No.");
  perDocGoods(leoDocs.length ? leoDocs : documents);
  perDocHsn(leoDocs.length ? leoDocs : documents);
  perDoc("Quantity (PKG)", leoDocs, "number_of_packages", "PKG");
  perDoc("Gross Weight (G. WT)", leoDocs, "total_gross_weight", "G. WT");

  // ---- Container Number: LEO first, else CLP → Forwarding Note → Form 13 ----
  const containerGroup = [leoDocs, clpDocs, fwdDocs, egateDocs].find((g) => g.some((d) => validContainersOf(d).length)) || [];
  containerGroup.forEach((d) => push("Container Number(s)", validContainersOf(d).join(", "), srcName(d), "Container No."));

  // ---- Seals ----
  perDocSeals(sealDocs.length ? sealDocs : leoDocs);

  // ---- Shipping-Instruction-only fields ----
  perDoc("Net WT", siDocs, "total_net_weight", "Net Weight");
  perDoc("Freight", siDocs, "freight", "Freight");

  // ---- Calculated totals (sum of every LEO) ----
  push("Total Quantity (PKG)", sumLeo("number_of_packages"), "Calculated", "Σ of all LEO PKG");
  push("Total Gross Weight (G. WT)", sumLeo("total_gross_weight"), "Calculated", "Σ of all LEO G. WT");

  return rows;
}

const setSummary = (summary, label, value) => {
  const f = summary.find((s) => s.label === label);
  if (f) f.value = value;
  else summary.push({ label, value });
};

function buildMblFromHbl(hblData = {}) {
  const data = JSON.parse(JSON.stringify(hblData || {}));
  data.summary = data.summary || [];

  setSummary(data.summary, "Shipper / Exporter", MBL_SHIPPER);
  setSummary(data.summary, "Consignee", "");
  setSummary(data.summary, "Notify Party", "");

  data.mblNumber = hblData.bookingNumber || "";
  delete data.hblNumber;
  delete data.bookingNumber;
  return data;
}

module.exports = { buildMblFromHbl, buildMblSourceSummary };
