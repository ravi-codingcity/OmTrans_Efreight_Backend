const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { logger } = require("../config/logger");

/* ------------------------------------------------------------------ */
/*  High-fidelity HBL/MBL PDF via template overlay (PyMuPDF).         */
/*  No MS Word / LibreOffice. The populated values are drawn directly  */
/*  onto the ORIGINAL template PDF, so every border / table / font /   */
/*  margin is preserved exactly. Node owns the field mapping (kept in  */
/*  lockstep with the DOCX) and passes a flat payload to Python.       */
/* ------------------------------------------------------------------ */

const SCRIPT_PATH = path.resolve(__dirname, "pdfOverlay.py");
const TEMPLATES_DIR = path.resolve(__dirname, "../templates");
const TEMPLATE_PDF = {
  hbl: path.join(TEMPLATES_DIR, "HBL Format Sample.pdf"),
  mbl: path.join(TEMPLATES_DIR, "MBL Format Sample.pdf"),
};

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "Not Found";

// Resolve a Python interpreter. PYTHON_PATH wins; otherwise try common names.
let cachedPython;
function resolvePython() {
  if (cachedPython !== undefined) return cachedPython;
  const candidates = [process.env.PYTHON_PATH, "python", "python3", "py"].filter(Boolean);
  for (const bin of candidates) {
    try {
      const args = bin === "py" ? ["-3", "-c", "import fitz"] : ["-c", "import fitz"];
      execFileSync(bin, args, { stdio: "pipe", timeout: 20000 });
      cachedPython = bin;
      return bin;
    } catch {
      /* try next */
    }
  }
  cachedPython = null;
  return null;
}

/** True when a Python interpreter with PyMuPDF is available. */
function overlayAvailable() {
  return Boolean(resolvePython());
}

// ── field mapping (mirrors hblTemplate.service.js fillDocumentXml) ──
const DESC_BLANK = "______________________";
function renderDescLine(l) {
  if (typeof l === "string") return l;
  const v = isEmpty(l.value) ? (l.blank ? DESC_BLANK : "") : String(l.value);
  return l.label ? `${l.label}: ${v}` : v;
}
function descGroup(id) {
  if (id === "invoiceNo" || id === "invoiceDate") return "invoice";
  if (id === "sbNo" || id === "sbDate") return "sb";
  if (/^goods/.test(String(id))) return "goods";
  return id;
}
function buildDescription(cargo) {
  const clean = (x) => (x && x !== "—" && x !== "Not Found" ? x : "");
  const descText = clean(cargo.description) ? String(cargo.description).trim() : "";
  const descLines = cargo.descLines && cargo.descLines.length
    ? cargo.descLines
    : descText.split("\n").map((value, i) => ({ id: `line-${i}`, value }));
  const lines = [];
  let prevGroup = null;
  for (const l of descLines) {
    const text = renderDescLine(l);
    if (text === "") continue;
    const g = descGroup(l.id);
    if (prevGroup !== null && g !== prevGroup) lines.push(""); // visual gap between groups
    lines.push(text);
    prevGroup = g;
  }
  return lines.join("\n");
}

/**
 * Build the flat overlay payload from the shipment data. `template` is 'hbl'|'mbl'.
 * Values use the exact same field mapping the DOCX uses, so DOCX & PDF stay in sync.
 */
function buildOverlayPayload(data, template, { hblNumber, mblNumber, bookingNumber } = {}) {
  const byLabel = {};
  (data.summary || []).forEach((s) => { byLabel[s.label] = isEmpty(s.value) ? "" : s.value; });
  const v = (label) => (isEmpty(byLabel[label]) ? "" : String(byLabel[label]));
  const clean = (x) => (isEmpty(x) ? "" : String(x));
  const cargo = data.cargo || {};

  const containers = (cargo.containers && cargo.containers.length ? cargo.containers : []).map((c) => ({
    seal: clean(c.containerSeal),
    qty: clean(c.quantity),
    gwt: clean(c.grossWeight),
    cbm: clean(c.cbm),
  }));
  const totals = cargo.totals && (!isEmpty(cargo.totals.quantity) || !isEmpty(cargo.totals.grossWeight))
    ? { qty: clean(cargo.totals.quantity), gwt: clean(cargo.totals.grossWeight) }
    : null;

  return {
    template,
    fields: {
      date: clean(data.date),
      shipper: v("Shipper / Exporter"),
      number: template === "mbl" ? clean(mblNumber) : clean(hblNumber),
      booking: clean(bookingNumber),
      consignee: v("Consignee"),
      notify: v("Notify Party"),
      placeOfReceipt: v("Place of Receipt"),
      preCarriage: v("Pre-Carriage By"),
      finalDestination: v("Final Destination (For Merchant Reference Only)"),
      vessel: v("Ocean Vessel / Voyage No. / Flag"),
      pol: v("Port of Loading (POL)"),
      pod: v("Port of Discharge (POD)"),
      placeOfDelivery: v("Place of Delivery"),
      description: buildDescription(cargo),
      marks: v("Marks & Numbers"),
    },
    containers,
    totals,
  };
}

/**
 * Generate the HBL/MBL PDF by overlaying data onto the template PDF.
 * Returns the output path. Throws if Python/PyMuPDF or the template is missing.
 */
function overlayShipmentPdf(template, data, pdfPath, numbers = {}) {
  const python = resolvePython();
  if (!python) throw new Error("Python with PyMuPDF not available for PDF overlay");
  const templatePdf = TEMPLATE_PDF[template];
  if (!templatePdf || !fs.existsSync(templatePdf)) throw new Error(`Template PDF not found: ${template}`);
  // Date is resolved to today by the DOCX path; mirror that here.
  if (isEmpty(data.date)) numbers = { ...numbers };
  const payload = buildOverlayPayload(data, template, numbers);
  if (isEmpty(payload.fields.date)) payload.fields.date = todayStr();

  const args = python === "py"
    ? ["-3", SCRIPT_PATH, templatePdf, pdfPath]
    : [SCRIPT_PATH, templatePdf, pdfPath];
  execFileSync(python, args, { input: JSON.stringify(payload), stdio: ["pipe", "pipe", "pipe"], timeout: 60000 });
  if (!fs.existsSync(pdfPath)) throw new Error("Overlay produced no PDF");
  return pdfPath;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

module.exports = { overlayShipmentPdf, overlayAvailable, buildOverlayPayload };
