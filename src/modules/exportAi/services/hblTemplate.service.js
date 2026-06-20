const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const JSZip = require("jszip");
const { aiConfig } = require("../config/aiConfig");
const { ensureDir } = require("../utils/files");
const { logger } = require("../config/logger");
const { renderShipmentPdf } = require("./fallbackPdf.service");

// Master templates — stored once, loaded per request, never overwritten.
const HBL_TEMPLATE_PATH = path.resolve(__dirname, "../templates/HBL Format Sample.docx");
const MBL_TEMPLATE_PATH = path.resolve(__dirname, "../templates/MBL Format Sample.docx");

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "Not Found";
const escapeXml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function valuePara(value) {
  const lines = String(value == null ? "" : value).split("\n");
  const runs = lines.map((ln, i) => {
    const br = i > 0 ? "<w:r><w:br/></w:r>" : "";
    return `${br}<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(ln)}</w:t></w:r>`;
  }).join("");
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;
}
function appendCell(cell, value) { return cell.replace(/<\/w:tc>\s*$/, `${valuePara(value)}</w:tc>`); }
function setCell(cell, value) {
  const tcPr = (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [""])[0];
  return `<w:tc>${tcPr}${valuePara(value)}</w:tc>`;
}

const DESC_BLANK = "______________________";
function renderDescLine(l) {
  if (typeof l === "string") return l;
  const v = isEmpty(l.value) ? (l.blank ? DESC_BLANK : "") : String(l.value);
  return l.label ? `${l.label}: ${v}` : v;
}

const ROW_RE = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
const CELL_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;
const cellText = (tc) => tc.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const isMergedBox = (tc) => /<w:vMerge\s+w:val="restart"/.test(tc);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
function insertDate(xml, dateStr) {
  return xml.replace(/(<w:t[^>]*>\s*Date\s*:?\s*<\/w:t>\s*<\/w:r>)/i, (m) => {
    const run = `<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve"> ${escapeXml(dateStr)}</w:t></w:r>`;
    return `${m}${run}`;
  });
}

function fillDocumentXml(doc, data, { hblNumber, bookingNumber, mblNumber } = {}) {
  const byLabel = {};
  (data.summary || []).forEach((s) => { byLabel[s.label] = isEmpty(s.value) ? "" : s.value; });
  const v = (label) => (isEmpty(byLabel[label]) ? "" : byLabel[label]);

  const cargo = data.cargo || {};
  const clean = (x) => (x && x !== "—" && x !== "Not Found" ? x : "");
  const descText = clean(cargo.description) ? String(cargo.description).trim() : "";
  const descLines = (cargo.descLines && cargo.descLines.length) ? cargo.descLines : descText.split("\n").map((value, i) => ({ id: `line-${i}`, value }));

  const tblMatch = doc.match(/<w:tbl>[\s\S]*<\/w:tbl>/);
  if (!tblMatch) throw new Error("HBL template: main table not found");
  const tbl = tblMatch[0];

  const grid = [];
  (tbl.match(ROW_RE) || []).forEach((row) => {
    grid.push((row.match(CELL_RE) || []).map((tc) => ({ text: cellText(tc), merged: isMergedBox(tc) })));
  });

  const targets = {};
  const find = (re) => {
    for (let ri = 0; ri < grid.length; ri += 1)
      for (let ci = 0; ci < grid[ri].length; ci += 1)
        if (re.test(grid[ri][ci].text)) return { ri, ci };
    return null;
  };

  const labelFields = [
    [/CONSIGNOR\s*\/\s*SHIPPER/i, v("Shipper / Exporter")],
    [/HBL\s*(No\.?|Number)/i, clean(hblNumber)],
    [/MBL\s*(No\.?|Number)/i, clean(mblNumber)],
    [/Booking\s*(No\.?|Number)/i, clean(bookingNumber)],
    [/^\s*CONSIGNEE\b/i, v("Consignee")],
    [/NOTIFY\s*PARTY/i, v("Notify Party")],
    [/Place of Receipt/i, v("Place of Receipt")],
    [/Pre-?Carriage/i, v("Pre-Carriage By")],
    [/Final Destination/i, v("Final Destination (For Merchant Reference Only)")],
    [/Vessel\s*Name|Ocean\s*Vessel/i, v("Ocean Vessel / Voyage No. / Flag")],
    [/Port of Loading/i, v("Port of Loading (POL)")],
    [/Port of Discharge/i, v("Port of Discharge (POD)")],
    [/Place of Delivery/i, v("Place of Delivery")],
  ];
  for (const [re, value] of labelFields) {
    if (isEmpty(value)) continue;
    const at = find(re);
    if (at) targets[`${at.ri},${at.ci}`] = { value, mode: "append" };
  }

  let rowIdx = -1;
  const labelledTbl = tbl.replace(ROW_RE, (row) => {
    rowIdx += 1;
    let cellIdx = -1;
    return row.replace(CELL_RE, (cell) => {
      cellIdx += 1;
      const t = targets[`${rowIdx},${cellIdx}`];
      if (!t || isEmpty(t.value)) return cell;
      return t.mode === "set" ? setCell(cell, t.value) : appendCell(cell, t.value);
    });
  });

  const finalTbl = expandCargoRows(labelledTbl, cargo, descLines, v("Marks & Numbers"));
  const dateStr = clean(data.date) || todayStr();
  return insertDate(doc.replace(tbl, () => finalTbl), dateStr);
}

const isEmptyRow = (row) => !cellText(row);

function withVMerge(tcPr, restart) {
  const tag = restart ? '<w:vMerge w:val="restart"/>' : "<w:vMerge/>";
  if (!tcPr) return `<w:tcPr>${tag}</w:tcPr>`;
  if (/<w:vMerge\b[^>]*\/>/.test(tcPr)) return tcPr.replace(/<w:vMerge\b[^>]*\/>/, tag);
  return tcPr.replace("<w:tcPr>", `<w:tcPr>${tag}`);
}
const tcPrOf = (cell) => (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [""])[0];

const DESC_TCMAR = '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar>';
function withCellMargins(tcPr) {
  if (!tcPr) return `<w:tcPr>${DESC_TCMAR}</w:tcPr>`;
  if (/<w:tcMar>/.test(tcPr)) return tcPr;
  if (/<w:vAlign\b/.test(tcPr)) return tcPr.replace(/<w:vAlign\b[^>]*\/>/, (m) => `${DESC_TCMAR}${m}`);
  return tcPr.replace("</w:tcPr>", `${DESC_TCMAR}</w:tcPr>`);
}

function descPara(value, before = 0) {
  const lines = String(value == null ? "" : value).split("\n");
  const runs = lines.map((ln, i) => {
    const br = i > 0 ? "<w:r><w:br/></w:r>" : "";
    return `${br}<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(ln)}</w:t></w:r>`;
  }).join("");
  return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;
}
function descGroup(id) {
  if (id === "invoiceNo" || id === "invoiceDate") return "invoice";
  if (id === "sbNo" || id === "sbDate") return "sb";
  if (/^goods/.test(id)) return "goods";
  return id;
}
const DESC_GROUP_GAP = 120;
function descCellBody(lines) {
  if (!lines || !lines.length) return "<w:p/>";
  let prevGroup = null;
  const parts = [];
  for (const l of lines) {
    const text = renderDescLine(l);
    if (text === "") continue;
    const g = descGroup(l.id);
    const before = prevGroup !== null && g !== prevGroup ? DESC_GROUP_GAP : 0;
    parts.push(descPara(text, before));
    prevGroup = g;
  }
  return parts.length ? parts.join("") : "<w:p/>";
}
const descRestartCell = (cell, lines) => `<w:tc>${withCellMargins(withVMerge(tcPrOf(cell), true))}${descCellBody(lines)}</w:tc>`;
const descContinueCell = (cell) => `<w:tc>${withVMerge(tcPrOf(cell), false)}<w:p/></w:tc>`;

const BOTTOM_BORDER = '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>';
function withBottomBorder(tcPr) {
  if (!tcPr) return `<w:tcPr><w:tcBorders>${BOTTOM_BORDER}</w:tcBorders></w:tcPr>`;
  if (/<w:tcBorders>/.test(tcPr)) {
    return tcPr.replace(/<w:tcBorders>([\s\S]*?)<\/w:tcBorders>/, (m, inner) => `<w:tcBorders>${inner.replace(/<w:bottom\b[^>]*\/>/, "")}${BOTTOM_BORDER}</w:tcBorders>`);
  }
  if (/<w:vMerge\b[^>]*\/>/.test(tcPr)) return tcPr.replace(/(<w:vMerge\b[^>]*\/>)/, `$1<w:tcBorders>${BOTTOM_BORDER}</w:tcBorders>`);
  return tcPr.replace("<w:tcPr>", `<w:tcPr><w:tcBorders>${BOTTOM_BORDER}</w:tcBorders>`);
}
function closeCellBottom(cell) {
  const m = cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  if (!m) return cell.replace("<w:tc>", `<w:tc><w:tcPr><w:tcBorders>${BOTTOM_BORDER}</w:tcBorders></w:tcPr>`);
  return cell.replace(m[0], withBottomBorder(m[0]));
}

function expandCargoRows(tbl, cargo, descLines, marks = "") {
  const firstTr = tbl.indexOf("<w:tr");
  const lastTrEnd = tbl.lastIndexOf("</w:tr>") + "</w:tr>".length;
  if (firstTr === -1) return tbl;
  const open = tbl.slice(0, firstTr);
  const tail = tbl.slice(lastTrEnd);
  const rows = tbl.slice(firstTr, lastTrEnd).match(ROW_RE) || [];

  const headerIdx = rows.findIndex((r) => /Container No\.?\s*\/\s*Seal No\.?/i.test(cellText(r)));
  if (headerIdx === -1 || headerIdx + 1 >= rows.length) return tbl;

  const headerCellArr = rows[headerIdx].match(CELL_RE) || [];
  const descCol = headerCellArr.findIndex((c) => /Description of Goods/i.test(cellText(c)));
  const headerCells = headerCellArr.length;
  const templateRow = rows[headerIdx + 1];
  let blockEnd = headerIdx + 1;
  while (blockEnd < rows.length && (rows[blockEnd].match(CELL_RE) || []).length === headerCells && isEmptyRow(rows[blockEnd])) blockEnd += 1;
  if (blockEnd === headerIdx + 1) blockEnd = headerIdx + 2;

  const entries = cargo.containers && cargo.containers.length ? cargo.containers : [{ containerSeal: "", quantity: "", grossWeight: "", cbm: "" }];
  const rowValues = entries.map((e) => [e.containerSeal, e.quantity, "", e.grossWeight, e.cbm || ""]);
  if (cargo.totals) rowValues.push(["", `Total Quantity (PKG): ${cargo.totals.quantity}`, "", `Gross Weight (G. WT): ${cargo.totals.grossWeight}`, ""]);

  const isTotalsRow = (i) => cargo.totals && i === rowValues.length - 1;
  const lastIdx = rowValues.length - 1;

  const newRows = rowValues.map((values, i) => {
    let ci = -1;
    const isLast = i === lastIdx;
    return templateRow.replace(CELL_RE, (cell) => {
      ci += 1;
      let out;
      if (ci === descCol) {
        out = i === 0 ? descRestartCell(cell, descLines) : descContinueCell(cell);
      } else if (ci === 1 && i === 0 && !isTotalsRow(i)) {
        const body = `${valuePara(isEmpty(values[1]) ? "" : values[1])}${isEmpty(marks) ? "" : valuePara(marks)}`;
        out = `<w:tc>${tcPrOf(cell)}${body}</w:tc>`;
      } else if (isEmpty(values[ci])) {
        out = cell;
      } else {
        out = setCell(cell, values[ci]);
      }
      return isLast ? closeCellBottom(out) : out;
    });
  });

  const merged = [...rows.slice(0, headerIdx + 1), ...newRows, ...rows.slice(blockEnd)];
  return open + merged.join("") + tail;
}

async function renderDocBuffer(data, opts = {}) {
  const buf = fs.readFileSync(opts.templatePath || HBL_TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file("word/document.xml").async("string");
  const merged = {
    hblNumber: opts.hblNumber != null ? opts.hblNumber : data.hblNumber,
    bookingNumber: opts.bookingNumber != null ? opts.bookingNumber : data.bookingNumber,
    mblNumber: opts.mblNumber != null ? opts.mblNumber : data.mblNumber,
  };
  zip.file("word/document.xml", fillDocumentXml(docXml, data, merged));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function fillTemplate(data, docxPath, opts) {
  const out = await renderDocBuffer(data, opts);
  fs.writeFileSync(docxPath, out);
}

function convertWithWord(docxPath, pdfPath) {
  const esc = (p) => p.replace(/'/g, "''");
  const script = `$ErrorActionPreference='Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open('${esc(docxPath)}', $false, $true)
  $doc.ExportAsFixedFormat('${esc(pdfPath)}', 17)
  $doc.Close($false)
} finally { $word.Quit() }`;
  const scriptPath = path.join(os.tmpdir(), `hbl_pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(scriptPath, script, "utf8");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { stdio: "pipe", timeout: 90000 });
  } finally {
    try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
  }
  return "word";
}

function convertWithLibreOffice(docxPath, pdfPath) {
  const outDir = path.dirname(pdfPath);
  const profileDir = path.join(os.tmpdir(), `lo_profile_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const userInstall = `-env:UserInstallation=file://${profileDir}`;
  const candidates = [
    process.env.SOFFICE_PATH, "soffice", "libreoffice",
    "/usr/bin/soffice", "/usr/bin/libreoffice",
    "/opt/libreoffice/program/soffice", "/snap/bin/libreoffice",
  ].filter(Boolean);

  let lastErr;
  for (const bin of candidates) {
    try {
      execFileSync(
        bin,
        [userInstall, "--headless", "--nologo", "--nofirststartwizard", "--norestore", "--convert-to", "pdf", "--outdir", outDir, docxPath],
        { stdio: "pipe", timeout: 120000, env: { ...process.env, HOME: process.env.HOME || os.tmpdir() } }
      );
      const produced = path.join(outDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
      if (produced !== pdfPath && fs.existsSync(produced)) fs.renameSync(produced, pdfPath);
      if (!fs.existsSync(pdfPath)) throw new Error("LibreOffice ran but produced no PDF");
      return "libreoffice";
    } catch (err) {
      const detail = err && err.stderr ? String(err.stderr).trim() : err.message;
      lastErr = new Error(`${bin}: ${detail}`);
    } finally {
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
  throw lastErr || new Error("No LibreOffice binary found for PDF conversion");
}

// Convert the filled DOCX to PDF using a real office engine (Word on Windows,
// LibreOffice elsewhere). Returns the engine name so callers know the PDF is a
// faithful render of the template (vs. the built-in approximation fallback).
function convertToPdf(docxPath, pdfPath) {
  // Allow LibreOffice on Windows too when explicitly configured.
  if (process.platform === "win32" && !process.env.SOFFICE_PATH) return convertWithWord(docxPath, pdfPath);
  try {
    return convertWithLibreOffice(docxPath, pdfPath);
  } catch (err) {
    if (process.platform === "win32") return convertWithWord(docxPath, pdfPath);
    throw err;
  }
}

async function generateReports(jobId, data, { templatePath, prefix, fallback, ...numbers }) {
  const dir = ensureDir(path.resolve(aiConfig.reportDir, String(jobId)));
  const docxPath = path.join(dir, `${prefix}.docx`);
  const pdfPath = path.join(dir, `${prefix}.pdf`);

  await fillTemplate(data, docxPath, { templatePath, ...numbers });

  try {
    const pdfEngine = convertToPdf(docxPath, pdfPath) || "office";
    return { docxPath, pdfPath, pdfEngine };
  } catch (err) {
    const engine = process.platform === "win32" ? "MS Word" : "LibreOffice";
    logger.warn(`${prefix} PDF via ${engine} unavailable — using built-in PDF fallback`, { error: err.message });
  }
  // No office engine available. Produce an approximate PDF so the server still
  // has *something*, but flag it 'fallback' so the client renders the real DOCX
  // template instead for a faithful preview/PDF.
  try {
    await fallback(pdfPath);
    return { docxPath, pdfPath, pdfEngine: "fallback" };
  } catch (err) {
    logger.error(`${prefix} fallback PDF rendering failed — DOCX only`, { error: err.message });
    return { docxPath, pdfPath: undefined, pdfEngine: "none" };
  }
}

function generateHblReports(jobId, data, opts = {}) {
  return generateReports(jobId, data, {
    templatePath: HBL_TEMPLATE_PATH,
    prefix: "hbl-report",
    hblNumber: opts.hblNumber != null ? opts.hblNumber : data.hblNumber,
    bookingNumber: opts.bookingNumber != null ? opts.bookingNumber : data.bookingNumber,
    fallback: (pdfPath) => renderShipmentPdf(pdfPath, data, { title: "HOUSE BILL OF LADING", numberLabel: "HBL No.", numberKey: "hblNumber" }),
  });
}

function generateMblReports(jobId, data, opts = {}) {
  return generateReports(jobId, data, {
    templatePath: MBL_TEMPLATE_PATH,
    prefix: "mbl-report",
    mblNumber: opts.mblNumber != null ? opts.mblNumber : data.mblNumber,
    fallback: (pdfPath) => renderShipmentPdf(pdfPath, data, { title: "MASTER BILL OF LADING", numberLabel: "MBL No.", numberKey: "mblNumber" }),
  });
}

module.exports = { HBL_TEMPLATE_PATH, MBL_TEMPLATE_PATH, convertToPdf, renderDocBuffer, generateHblReports, generateMblReports };
