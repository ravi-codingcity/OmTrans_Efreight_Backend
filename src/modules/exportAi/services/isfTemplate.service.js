const path = require("node:path");
const fs = require("node:fs");
const JSZip = require("jszip");
const { aiConfig } = require("../config/aiConfig");
const { ensureDir } = require("../utils/files");
const { logger } = require("../config/logger");
const { convertToPdf } = require("./hblTemplate.service");
const { renderIsfPdf } = require("./fallbackPdf.service");

const ISF_TEMPLATE_PATH = path.resolve(__dirname, "../templates/ISF Format.docx");

const escapeXml = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ROW_RE = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
const CELL_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;

function valuePara(value) {
  const lines = String(value == null ? "" : value).split("\n");
  const runs = lines.map((ln, i) => {
    const br = i > 0 ? "<w:r><w:br/></w:r>" : "";
    return `${br}<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(ln)}</w:t></w:r>`;
  }).join("");
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;
}
function setCell(cell, value) {
  const tcPr = (cell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [""])[0];
  return `<w:tc>${tcPr}${valuePara(value)}</w:tc>`;
}

function fillIsfXml(doc, values) {
  const tblMatch = doc.match(/<w:tbl>[\s\S]*<\/w:tbl>/);
  if (!tblMatch) throw new Error("ISF template: table not found");
  const tbl = tblMatch[0];

  let dataRow = -1;
  const filled = tbl.replace(ROW_RE, (row) => {
    const cells = row.match(CELL_RE) || [];
    if (cells.length < 3) return row;
    const sno = cells[0].replace(/<[^>]+>/g, "").trim();
    if (!/^\d+$/.test(sno)) return row;
    dataRow += 1;
    const value = values[dataRow];
    if (value === undefined || value === null || String(value) === "") return row;
    let ci = -1;
    return row.replace(CELL_RE, (cell) => {
      ci += 1;
      return ci === 2 ? setCell(cell, value) : cell;
    });
  });
  return doc.replace(tbl, () => filled);
}

function isfValues(d = {}) {
  const join = (...parts) => parts.filter((p) => p != null && String(p).trim() !== "").join("\n");
  return [
    d.manufacturer, d.seller, d.buyer, d.shipTo, d.invoiceNumber, d.invoiceDate,
    d.stuffingLocation, d.consolidator, d.countryOfOrigin, d.htsNumber, d.vesselVoyage,
    join(d.mblNo, d.hblNo, d.scacCode, d.amsNo),
    d.vesselEtd, d.vesselEta, d.containerNo, d.commodityDescription,
  ];
}

async function renderIsfBuffer(data) {
  const zip = await JSZip.loadAsync(fs.readFileSync(ISF_TEMPLATE_PATH));
  const docXml = await zip.file("word/document.xml").async("string");
  zip.file("word/document.xml", fillIsfXml(docXml, isfValues(data)));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function generateIsfReports(jobId, data) {
  const dir = ensureDir(path.resolve(aiConfig.reportDir, String(jobId)));
  const docxPath = path.join(dir, "isf-report.docx");
  const pdfPath = path.join(dir, "isf-report.pdf");
  fs.writeFileSync(docxPath, await renderIsfBuffer(data));
  try {
    convertToPdf(docxPath, pdfPath);
    return { docxPath, pdfPath };
  } catch (err) {
    const engine = process.platform === "win32" ? "MS Word" : "LibreOffice";
    logger.warn(`ISF PDF via ${engine} unavailable — using built-in PDF fallback`, { error: err.message });
  }
  try {
    await renderIsfPdf(pdfPath, data);
    return { docxPath, pdfPath };
  } catch (err) {
    logger.error("ISF fallback PDF rendering failed — DOCX only", { error: err.message });
    return { docxPath, pdfPath: undefined };
  }
}

module.exports = { ISF_TEMPLATE_PATH, renderIsfBuffer, generateIsfReports };
