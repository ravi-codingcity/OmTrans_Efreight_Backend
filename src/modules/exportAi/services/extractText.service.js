const fs = require("node:fs");
const path = require("node:path");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const XLSX = require("xlsx");
const { logger } = require("../config/logger");

/* ------------------------------------------------------------------ */
/*  Unified document text extraction.                                  */
/*  Office formats (DOC, DOCX, XLS, XLSX, CSV) are NOT supported as     */
/*  inline uploads by Gemini (e.g. "Unsupported MIME type:             */
/*  application/msword"). We extract their text/data locally and send  */
/*  the normalized text to Gemini instead. PDFs and images are sent    */
/*  inline (Gemini handles those natively).                            */
/* ------------------------------------------------------------------ */

// Gemini-native inline types — sent as-is, no text extraction needed.
const INLINE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif",
]);

const wordExtractor = new WordExtractor();

/** Collapse excess whitespace/blank lines while preserving line structure. */
function normalizeText(raw) {
  return String(raw || "")
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ") // non-breaking spaces
    .replace(/[ \t]+\n/g, "\n") // trailing spaces
    .replace(/[ \t]{2,}/g, " ") // runs of spaces/tabs
    .replace(/\n{3,}/g, "\n\n") // 3+ blank lines -> 1
    .trim();
}

/** Resolve a lowercase extension from filename, falling back to the MIME type. */
function resolveExt(originalName, mimeType) {
  const fromName = path.extname(originalName || "").replace(/^\./, "").toLowerCase();
  if (fromName) return fromName;
  const m = String(mimeType || "").toLowerCase();
  if (m.includes("wordprocessingml")) return "docx";
  if (m === "application/msword") return "doc";
  if (m.includes("spreadsheetml")) return "xlsx";
  if (m === "application/vnd.ms-excel") return "xls";
  if (m === "text/csv") return "csv";
  return "";
}

// ── per-format extractors ──
async function extractDocx(filePath) {
  const { value } = await mammoth.extractRawText({ path: filePath });
  return value || "";
}

async function extractDoc(filePath) {
  const doc = await wordExtractor.extract(filePath);
  // Body plus any header/footer text that may carry shipment details.
  return [doc.getBody(), doc.getHeaders(), doc.getFooters()].filter(Boolean).join("\n");
}

function extractSpreadsheet(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const parts = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false, skipHidden: true });
    if (csv && csv.trim()) parts.push(`# Sheet: ${name}\n${csv}`);
  }
  return parts.join("\n\n");
}

function extractCsvOrText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Decide how a document should be sent to Gemini.
 * @returns {Promise<{mode:'inline'}|{mode:'text', text:string}>}
 *  - 'inline' : a Gemini-native binary (PDF/image) — send as inlineData.
 *  - 'text'   : office formats — extracted & normalized text to send as a text part.
 */
async function prepareForGemini({ filePath, mimeType, originalName }) {
  if (INLINE_MIME.has(String(mimeType || "").toLowerCase())) return { mode: "inline" };

  const ext = resolveExt(originalName, mimeType);
  let raw = "";
  switch (ext) {
    case "docx":
      raw = await extractDocx(filePath);
      break;
    case "doc":
      raw = await extractDoc(filePath);
      break;
    case "xlsx":
    case "xls":
      raw = extractSpreadsheet(filePath);
      break;
    case "csv":
    case "txt":
      raw = extractCsvOrText(filePath);
      break;
    default:
      // Unknown non-inline type — let the caller fall back to an inline upload.
      logger.warn(`No text extractor for "${originalName}" (ext="${ext}", mime="${mimeType}") — sending inline`);
      return { mode: "inline" };
  }

  const text = normalizeText(raw);
  if (!text) throw new Error(`No readable text could be extracted from "${originalName}"`);
  return { mode: "text", text };
}

module.exports = { prepareForGemini, normalizeText, INLINE_MIME };
