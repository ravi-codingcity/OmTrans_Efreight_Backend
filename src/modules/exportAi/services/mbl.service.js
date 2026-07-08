const { isPriorityDoc, isShippingInstruction } = require("./comparison.service");

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
  const leoDocs = documents.filter(isPriorityDoc);
  const siDocs = documents.filter(isShippingInstruction);
  const bookingDocs = documents.filter((d) => d.detectedType === "booking_confirmation" || /booking/i.test(name(d)));
  const isMumbai = String(options.location || "").trim().toLowerCase() === "mumbai";
  const fwdDocs = documents.filter((d) => d.detectedType === "forwarding_note" || /forwarding/i.test(name(d)));
  const egateDocs = documents.filter((d) => ["egate", "form_10"].includes(d.detectedType) || /form[\s_-]*10|form10|e[\s-]?gate|sez[\s-]*4|form[\s_-]*13|form[\s_-]*6(?!\d)/i.test(name(d)));
  const clpDocs = documents.filter((d) => d.detectedType === "clp" || /\bclp\b|container\s*load\s*plan/i.test(name(d)));
  const sealDocs = isMumbai ? [...egateDocs, ...fwdDocs, ...clpDocs] : [...fwdDocs, ...egateDocs, ...clpDocs];

  const pushU = (arr, v) => { if (!isEmptyVal(v) && !arr.some((x) => normKeyVal(x) === normKeyVal(v))) arr.push(String(v).trim()); };
  const cleanSeal = (s) => String(s || "").replace(/^\s*(line\s*seal\s*no\.?|agent\s*seal\s*no\.?|carrier\s*seal\s*no\.?|customs?\s*seal\s*no\.?|cust\s*seal\s*no\.?|line\s*seal|agent\s*seal|customs?\s*seal|seal\s*no\.?|seal)\s*[:.#-]*\s*/i, "").trim();

  const fromField = (docs, key) => {
    const vals = []; const src = [];
    docs.forEach((d) => { const v = d.extractedFields && d.extractedFields[key]; if (!isEmptyVal(v)) { pushU(vals, v); if (!src.includes(name(d))) src.push(name(d)); } });
    return { value: vals.join(", "), sources: src };
  };
  const fromGoods = (docs) => {
    const vals = []; const src = [];
    docs.forEach((d) => ((d.rawExtraction && d.rawExtraction.lineItems) || []).forEach((li) => { if (!isEmptyVal(li.description)) { pushU(vals, li.description); if (!src.includes(name(d))) src.push(name(d)); } }));
    if (!vals.length) docs.forEach((d) => { const v = d.extractedFields && d.extractedFields.description_of_goods; if (!isEmptyVal(v)) { pushU(vals, v); if (!src.includes(name(d))) src.push(name(d)); } });
    return { value: vals.join(" | "), sources: src };
  };
  const fromHsn = (docs) => {
    const vals = []; const src = [];
    docs.forEach((d) => {
      ((d.rawExtraction && d.rawExtraction.hsCodes) || []).forEach((c) => { if (!isEmptyVal(c)) { pushU(vals, c); if (!src.includes(name(d))) src.push(name(d)); } });
      const hc = d.extractedFields && d.extractedFields.hs_code; if (!isEmptyVal(hc)) { pushU(vals, hc); if (!src.includes(name(d))) src.push(name(d)); }
    });
    return { value: vals.join(", "), sources: src };
  };
  // Only a real Container Number (ISO 6346: 4 letters + 6-7 digits) qualifies — the
  // CIN Number on the LEO must never be reported as the Container Number.
  const isContainerNoVal = (v) => /^[A-Z]{4}\d{6,7}$/.test(normKeyVal(v));
  const fromContainers = (docs) => {
    const vals = []; const src = [];
    docs.forEach((d) => {
      ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => { if (isContainerNoVal(c.containerNo)) { pushU(vals, c.containerNo); if (!src.includes(name(d))) src.push(name(d)); } });
      const cf = d.extractedFields && d.extractedFields.container_number; if (isContainerNoVal(cf)) { pushU(vals, cf); if (!src.includes(name(d))) src.push(name(d)); }
    });
    return { value: vals.join(", "), sources: src };
  };
  // Container Number source resolution: LEO / Shipping Bill / EDI first, then fall
  // back in order CLP → Forwarding Note → Form 13 (E-Gate) — never the CIN.
  const resolveContainers = () => {
    for (const grp of [leoDocs, clpDocs, fwdDocs, egateDocs, documents]) {
      const r = fromContainers(grp);
      if (r.value) return r;
    }
    return { value: "", sources: [] };
  };
  const fromSeals = (docs) => {
    const vals = []; const src = [];
    docs.forEach((d) => {
      ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => [c.sealNo, c.linerSeal, c.agentSeal, c.customsSeal].forEach((s) => { if (!isEmptyVal(s)) { pushU(vals, cleanSeal(s)); if (!src.includes(name(d))) src.push(name(d)); } }));
      ((d.rawExtraction && d.rawExtraction.seals) || []).forEach((s) => { if (!isEmptyVal(s)) { pushU(vals, cleanSeal(s)); if (!src.includes(name(d))) src.push(name(d)); } });
    });
    return { value: vals.join(", "), sources: src };
  };

  const vessel = () => {
    const a = fromField(bookingDocs, "vessel_name");
    const parts = [a.value, fromField(bookingDocs, "voyage_number").value, fromField(bookingDocs, "vessel_flag").value].filter(Boolean);
    return { value: parts.join(" / "), sources: a.sources };
  };

  const entries = [
    { field: "Shipper / Exporter", res: { value: "OmTrans Logistics Ltd", sources: ["MBL format (fixed)"] } },
    { field: "MBL Number (Booking No.)", res: fromField(bookingDocs, "booking_number") },
    { field: "Place of Receipt", res: fromField(bookingDocs, "place_of_receipt") },
    { field: "Port of Loading (POL)", res: fromField(bookingDocs, "port_of_loading") },
    { field: "Port of Discharge (POD)", res: fromField(bookingDocs, "port_of_discharge") },
    { field: "Place of Delivery", res: fromField(bookingDocs, "place_of_delivery") },
    { field: "Vessel / Voyage / Flag", res: vessel() },
    { field: "ETD", res: fromField(bookingDocs, "vessel_etd") },
    { field: "ETA", res: fromField(bookingDocs, "vessel_eta") },
    { field: "Invoice Number", res: fromField(leoDocs, "invoice_number") },
    { field: "Invoice Date", res: fromField(leoDocs, "invoice_date") },
    { field: "Shipping Bill Number", res: fromField(leoDocs, "shipping_bill_number") },
    { field: "Shipping Bill Date", res: fromField(leoDocs, "shipping_bill_date") },
    { field: "IEC / BR Number", res: fromField(leoDocs, "iec_number") },
    { field: "Description of Goods", res: fromGoods(leoDocs.length ? leoDocs : documents) },
    { field: "HSN Code", res: fromHsn(leoDocs.length ? leoDocs : documents) },
    { field: "Quantity (PKG)", res: fromField(leoDocs, "number_of_packages") },
    { field: "Gross Weight (G. WT)", res: fromField(leoDocs, "total_gross_weight") },
    { field: "Container Number(s)", res: resolveContainers() },
    { field: "Seal Number(s)", res: fromSeals(sealDocs.length ? sealDocs : leoDocs) },
    { field: "Net WT", res: fromField(siDocs, "total_net_weight") },
    { field: "Freight", res: fromField(siDocs, "freight") },
  ];

  return entries
    .filter((e) => e.field === "Shipper / Exporter" || !isEmptyVal(e.res.value))
    .map((e) => ({ field: e.field, value: e.res.value || "", sources: e.res.sources && e.res.sources.length ? e.res.sources : [] }));
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
