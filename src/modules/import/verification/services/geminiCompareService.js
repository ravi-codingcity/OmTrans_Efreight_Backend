const crypto = require("node:crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiConfig } = require("../config/geminiConfig");

/* ------------------------------------------------------------------ */
/*  AI comparison service — CHA Checklist vs. system PDF document(s).  */
/*  All Gemini logic is isolated here. Given the checklist PDF and one  */
/*  or more system PDFs, it returns a rich, categorized comparison      */
/*  report (header, item-by-item, containers, certificates, SIMS,       */
/*  duty & tax) with computed dashboard totals and document references. */
/* ------------------------------------------------------------------ */

const log = (level, msg, extra) => {
  try {
    const line = `[DocVerify] ${msg}` + (extra ? ` ${JSON.stringify(extra)}` : "");
    // eslint-disable-next-line no-console
    (console[level] || console.log)(line);
  } catch {
    /* never let logging break the request */
  }
};

let client = null;
if (!geminiConfig.mockMode) {
  client = new GoogleGenerativeAI(geminiConfig.apiKey);
  log("info", `Gemini live mode (model: ${geminiConfig.model})`);
} else {
  log("warn", "GEMINI_API_KEY not set — AI Document Verification running in MOCK mode");
}

// A row status vocabulary used across header/container/certificate/SIMS/item rows.
const ROW_STATUS = ["match", "mismatch", "missing_in_system", "missing_in_checklist", "not_present"];

const INSTRUCTION = `You are an expert Indian customs Bill of Entry verification AI.

INPUTS:
1. The CHA "CHECK LIST - BILL OF ENTRY FOR HOME CONSUMPTION" (the REFERENCE). It is CONSOLIDATED
   from several supporting documents.
2. One or more SYSTEM documents (Commercial/Shipping Invoice, Packing List, HAWB, MAWB, Bill of
   Lading, Certificates, etc.) — each contributing part of the information.

METHOD (semantic, not label-matching):
- Extract structured data from the CHA Checklist AND from EVERY system document, then MERGE the
  system documents into ONE consolidated view (a value may exist in only one of them).
- Field NAMES/labels differ between documents — match by MEANING/CONTEXT, not identical labels.
- Compare ACTUAL business VALUES. IGNORE formatting, fonts, spacing, layout, case, punctuation
  and date format. Normalise numbers, weights, currency and dates before comparing.
- For EVERY compared field record its "sourceDocument" = the filename of the system document the
  value came from (or "" if unknown).

DETERMINISTIC NORMALISATION (apply these rules the SAME way every time so identical documents
ALWAYS produce the identical result — never guess):
- Numbers/amounts/quantities/weights: strip currency symbols, codes, thousands separators and
  units; compare NUMERICALLY. "1,000.00", "1000", "1000.0" and "USD 1,000" are all EQUAL.
  Treat values equal if they differ only by rounding to 2 decimals.
- HSN/CTH/Tariff codes: compare DIGITS ONLY (ignore spaces/dots). Treat as MATCH if equal, or if
  one is a leading prefix of the other (e.g. 6-digit "610910" matches 8-digit "61091000").
- Text (descriptions, names, addresses, ports): case-insensitive; ignore punctuation, extra
  whitespace and line breaks; treat common abbreviations/synonyms and word-order differences as
  EQUAL when they clearly refer to the same thing.
- Only report a difference when values GENUINELY differ after this normalisation. When in doubt
  and the values are plausibly the same, treat as "match" (avoid false positives).

Each comparison row has a "status" that is one of:
  "match"                : values agree,
  "mismatch"             : present in both but differ (also use for wrong/invalid values),
  "missing_in_system"    : in the checklist but NOT found in any system document,
  "missing_in_checklist" : in the system documents but NOT in the checklist,
  "not_present"          : absent from BOTH (only for optional things like SIMS).

Compare and report the following.

A) HEADER FIELDS — compare each of: Invoice Value, Invoice Date, Invoice Number,
   IGM Number, Port of Origin, Port of Shipment, Country of Origin, Country of Consignment,
   MBL/MAWB Number, HBL/HAWB Number, MAWB/HAWB Date, Bill of Entry Date, Number of Packages,
   BDL/BL Gross Weight, Marks & Numbers, Shipper Details, Consignee Details.

B) ITEM DETAILS — HIGHEST PRIORITY. Item-by-item comparison between the checklist and the
   Commercial/Shipping Invoice (and packing list). MATCH items across the documents by BEST FIT
   (primarily by HSN code, then by description similarity) — do NOT rely on row order, which
   often differs. For each matched item capture: description, hsnCode, quantity, unit, unitPrice,
   totalValue, countryOfOrigin, a status and detail. Apply the DETERMINISTIC NORMALISATION rules
   above to every value:
   - status = "match" when the item's description, HSN, quantity, unit price and total value are
     all equal after normalisation. Set status = "mismatch" ONLY when a value genuinely differs,
     and in "detail" name exactly which field(s) differ and the two values.
   - "missingItems": items in the checklist with no corresponding item in the system docs.
   - "extraItems": items in the system docs with no corresponding item in the checklist.
   Be conservative: if an item clearly corresponds and its values normalise to the same thing,
   report "match" — do not invent mismatches.

C) CONTAINERS — Container Number, Container Size, Container Type, Seal Number. List each of
   these AT MOST ONCE — never output duplicate rows for the same field.

D) CERTIFICATES — Certificate Number and any other certificate references. Do NOT include a
   "Certificate Type" field.
   Also inspect the CEPA certificate ("CEPA TJD-4350" / "COMPREHENSIVE ECONOMIC PARTNERSHIP
   AGREEMENT BETWEEN JAPAN AND THE REPUBLIC OF INDIA" — the same document the Certificate Number
   comes from) for the "ISSUED RETROACTIVELY" field/box and report it in "issuedRetroactively":
     - present = true if the field/label exists on the certificate, else false.
     - marked  = true if its checkbox/box is ticked/marked/checked, false if present but NOT
                 marked, null if the field is not present.

Do NOT extract, compare or output "SVB Reference" or "Certificate Type" anywhere in the result.

E) SIMS — MULTI-RECORD. The CHA Checklist may list a SINGLE or MULTIPLE SIMS Number + SIMS Date
   entries, and the uploaded SIMS document(s) contain corresponding entries.
   CRITICAL — read the ENTIRE CHA Checklist carefully before concluding SIMS is absent. SIMS data
   is often present but easy to miss: scan tables, annexures, remarks/notes, item-level rows and
   footnotes. The label varies — accept ANY of: "SIMS", "SIMS No", "SIMS Number", "SIMS Reg No",
   "SIMS Registration No", "Steel Import Monitoring System", "Registration No" (in a SIMS context),
   and a date labelled "SIMS Date"/"Reg Date"/"Registration Date". A SIMS Number is typically a
   long numeric/alphanumeric registration id. Do NOT report SIMS as missing from the checklist
   when such a value is actually present — only mark "missing_in_system" when the number IS in the
   checklist but genuinely NOT in any SIMS document.
   Extract EVERY SIMS Number and its SIMS Date from BOTH sides. MATCH records by SIMS Number
   (normalise: digits/letters only, ignore spaces/dots/case), then compare their SIMS Dates
   (normalise date format). For each record set "status":
     - "match"             : SIMS Number found on both sides AND dates equal,
     - "mismatch"          : SIMS Number found on both sides but the dates differ,
     - "missing_in_system" : in the checklist but NOT in any SIMS document,
     - "extra_in_system"   : in a SIMS document but NOT in the checklist.
   Give one record per distinct SIMS Number. If neither side has ANY SIMS data at all, return an
   empty "records" array.

F) DUTY & TAX — determine whether the CHA Checklist contains: Duty (Basic Customs Duty),
   Social Welfare Surcharge, IGST. For each charge found, capture name, amount, percentage, and
   whether it matches the supporting documents (matches: true/false, or null if not applicable).

G) missingDocuments — supporting documents the checklist clearly relies on but that were NOT
   provided among the system documents (else []).

Return ONLY a JSON object with EXACTLY this shape (a "row" = {field, checklistValue, systemValue,
status, sourceDocument, detail}); use null for absent values, never invent data:
{
  "summary": string,
  "header": [ row ],
  "items": {
    "rows": [ { "description": string, "hsnCode": string|null, "quantity": string|null,
                "unit": string|null, "unitPrice": string|null, "totalValue": string|null,
                "countryOfOrigin": string|null, "status": string, "sourceDocument": string|null,
                "detail": string } ],
    "missingItems": [ string ],
    "extraItems": [ string ]
  },
  "containers": [ row ],
  "certificates": [ row ],
  "issuedRetroactively": { "present": boolean, "marked": boolean|null, "sourceDocument": string|null, "detail": string },
  "sims": {
    "records": [ { "simsNumber": string, "simsDate": string|null, "status": string,
                   "sourceDocument": string|null, "detail": string } ]
  },
  "dutyTax": [ { "name": string, "amount": string|null, "percentage": string|null,
                 "present": boolean, "matches": boolean|null, "detail": string } ],
  "missingDocuments": [ string ]
}
Return valid JSON only — no prose, no markdown.`;

function extractJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : String(text);
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in AI response");
  return JSON.parse(candidate.slice(start, end + 1));
}

function describeAiError(err) {
  const m = String((err && err.message) || err || "");
  if (/AI_TIMEOUT/i.test(m)) return "The AI comparison took too long (large documents). Please try fewer/smaller PDFs, or retry.";
  if (/prepayment|credits?\s*(are\s*)?depleted|billing/i.test(m)) return "Gemini AI credits depleted — please top up billing.";
  if (/API[_\s]?key.*(not valid|invalid)|API_KEY_INVALID|invalid api key|\b401\b|\b403\b|permission/i.test(m)) return "Invalid or unauthorized Gemini API key.";
  if (/\b429\b|quota|rate.?limit|too many/i.test(m)) return "Gemini quota / rate limit exceeded — please try again later.";
  if (/\b(503|500)\b|overloaded|unavailable|high demand/i.test(m)) return "Gemini AI is temporarily overloaded — please retry.";
  if (/json/i.test(m)) return "Could not parse the AI response. Please retry.";
  return m || "Unknown error during AI comparison.";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isTransient = (m) => /\b(503|429|500|UNAVAILABLE|overloaded|high demand|timeout)\b/i.test(String(m));

// Reject after `ms` so we never hang past the hosting proxy's gateway timeout.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`AI_TIMEOUT: ${label} exceeded ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* --------------------------- normalization --------------------------- */
const str = (v) => (v == null ? null : String(v));
const strOr = (v, d = "") => (v == null ? d : String(v));

function normRow(r, defaultField) {
  const status = ROW_STATUS.includes(r && r.status) ? r.status : "mismatch";
  return {
    field: strOr(r && r.field, defaultField || "—") || "—",
    checklistValue: str(r && r.checklistValue),
    systemValue: str(r && r.systemValue),
    status,
    sourceDocument: strOr(r && r.sourceDocument, ""),
    detail: strOr(r && r.detail, ""),
  };
}
const normRows = (arr) => (Array.isArray(arr) ? arr.filter(Boolean).map((r) => normRow(r)) : []);

function normItemRow(r) {
  const status = ROW_STATUS.includes(r && r.status) ? r.status : "mismatch";
  return {
    description: strOr(r && r.description, "—") || "—",
    hsnCode: str(r && r.hsnCode),
    quantity: str(r && r.quantity),
    unit: str(r && r.unit),
    unitPrice: str(r && r.unitPrice),
    totalValue: str(r && r.totalValue),
    countryOfOrigin: str(r && r.countryOfOrigin),
    status,
    sourceDocument: strOr(r && r.sourceDocument, ""),
    detail: strOr(r && r.detail, ""),
  };
}

function normDutyTax(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((d) => d && (d.name || d.amount || d.percentage))
    .map((d) => ({
      name: strOr(d.name, "—"),
      amount: str(d.amount),
      percentage: str(d.percentage),
      present: d.present !== false,
      matches: typeof d.matches === "boolean" ? d.matches : null,
      detail: strOr(d.detail, ""),
    }));
}

// Multi-record SIMS: one entry per distinct SIMS Number, with its date + match status.
const SIMS_STATUS = ["match", "mismatch", "missing_in_system", "extra_in_system"];
function normSimsRecords(raw) {
  const arr = raw && Array.isArray(raw.records) ? raw.records : Array.isArray(raw) ? raw : [];
  return arr
    .filter((r) => r && (r.simsNumber || r.simsDate))
    .map((r) => ({
      simsNumber: strOr(r.simsNumber, "—") || "—",
      simsDate: str(r.simsDate),
      status: SIMS_STATUS.includes(r && r.status) ? r.status : "mismatch",
      sourceDocument: strOr(r && r.sourceDocument, ""),
      detail: strOr(r && r.detail, ""),
    }));
}
function buildSims(raw) {
  const records = normSimsRecords(raw);
  return {
    records,
    checklistCount: records.filter((r) => r.status !== "extra_in_system").length,
    systemCount: records.filter((r) => r.status !== "missing_in_system").length,
    matchedCount: records.filter((r) => r.status === "match").length,
    unmatchedCount: records.filter((r) => r.status === "mismatch").length,
    missingCount: records.filter((r) => r.status === "missing_in_system").length,
    extraCount: records.filter((r) => r.status === "extra_in_system").length,
  };
}

// "ISSUED RETROACTIVELY" on the CEPA certificate → present / marked status.
function normIssuedRetroactively(raw) {
  if (!raw || typeof raw !== "object") return null;
  const present = raw.present === true;
  const marked = present ? (raw.marked === true ? true : raw.marked === false ? false : null) : null;
  const status = !present ? "not_found" : marked ? "present_marked" : "present_not_marked";
  return { present, marked, status, sourceDocument: strOr(raw.sourceDocument, ""), detail: strOr(raw.detail, "") };
}

// Fields explicitly removed from the verification report.
const DROP_FIELD_RE = /^\s*(svb\s*ref(erence)?|certificate\s*type)\s*$/i;
const keepField = (r) => r && !DROP_FIELD_RE.test(String(r.field || ""));

// Remove duplicate rows that repeat the same field (e.g. Container Number/Size/Type/
// Seal appearing twice). Keeps the first — preferring a populated/"match" row.
function dedupeByField(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = String(r.field || "").trim().toLowerCase();
    const existing = byKey.get(key);
    if (!existing) { byKey.set(key, r); continue; }
    const richer = (x) => (x.checklistValue != null ? 1 : 0) + (x.systemValue != null ? 1 : 0) + (x.status === "match" ? 1 : 0);
    if (richer(r) > richer(existing)) byKey.set(key, r);
  }
  return [...byKey.values()];
}
const cleanRows = (arr) => dedupeByField(normRows(arr).filter(keepField));

function normalizeResult(parsed) {
  const header = cleanRows(parsed.header);
  const containers = cleanRows(parsed.containers);
  const certificates = cleanRows(parsed.certificates);
  const sims = buildSims(parsed.sims);
  const issuedRetroactively = normIssuedRetroactively(parsed.issuedRetroactively);
  const itemsRaw = parsed.items || {};
  const items = {
    rows: Array.isArray(itemsRaw.rows) ? itemsRaw.rows.filter(Boolean).map(normItemRow) : [],
    missingItems: Array.isArray(itemsRaw.missingItems) ? itemsRaw.missingItems.filter(Boolean).map(String) : [],
    extraItems: Array.isArray(itemsRaw.extraItems) ? itemsRaw.extraItems.filter(Boolean).map(String) : [],
  };
  const dutyTax = normDutyTax(parsed.dutyTax);
  const missingDocuments = Array.isArray(parsed.missingDocuments) ? parsed.missingDocuments.filter(Boolean).map(String) : [];

  // SIMS records mapped to row-shape so they count toward the dashboard & summaries.
  const simsRows = sims.records.map((r) => ({
    field: `SIMS No. ${r.simsNumber}${r.simsDate ? ` (${r.simsDate})` : ""}`,
    checklistValue: r.simsDate,
    systemValue: r.simsDate,
    status: r.status,
    sourceDocument: r.sourceDocument,
    detail: r.detail,
  }));

  // All field-style rows that count toward the dashboard (exclude "not_present").
  const fieldRows = [...header, ...containers, ...certificates, ...simsRows];
  const itemRows = items.rows;
  const comparable = [...fieldRows, ...itemRows].filter((r) => r.status !== "not_present");

  const isMatch = (r) => r.status === "match";
  const isMismatch = (r) => r.status === "mismatch";
  const isMissing = (r) => r.status === "missing_in_system" || r.status === "missing_in_checklist" || r.status === "extra_in_system";

  const matchedRows = comparable.filter(isMatch);
  const mismatchedRows = comparable.filter(isMismatch);
  const missingRows = comparable.filter(isMissing);

  const missingExtraItems = items.missingItems.length + items.extraItems.length;

  const totalMatched = matchedRows.length;
  const totalUnmatched = mismatchedRows.length;
  const totalMissing = missingRows.length + missingExtraItems;
  const totalCompared = totalMatched + totalUnmatched + totalMissing;
  const matchPercentage = totalCompared === 0 ? 0 : Math.round((totalMatched / totalCompared) * 100);

  const match =
    totalUnmatched === 0 &&
    totalMissing === 0 &&
    missingDocuments.length === 0 &&
    dutyTax.every((d) => d.matches !== false);

  // Field-label helper for item rows in the summary lists.
  const itemLabel = (r) => `Item: ${r.description}`;

  const matchedFields = [
    ...matchedRows.filter((r) => !itemRows.includes(r)).map((r) => ({ field: r.field, value: r.systemValue ?? r.checklistValue ?? "", sourceDocument: r.sourceDocument })),
    ...matchedRows.filter((r) => itemRows.includes(r)).map((r) => ({ field: itemLabel(r), value: r.description, sourceDocument: r.sourceDocument })),
  ];
  const unmatchedFields = mismatchedRows.map((r) => ({
    field: itemRows.includes(r) ? itemLabel(r) : r.field,
    expected: r.systemValue,
    actual: r.checklistValue,
    reason: r.detail || "Values differ.",
    sourceDocument: r.sourceDocument,
  }));
  const missingInfo = [
    ...missingRows.map((r) => ({
      field: itemRows.includes(r) ? itemLabel(r) : r.field,
      where: r.status === "missing_in_system" ? "system" : "checklist",
      sourceDocument: r.sourceDocument,
      detail: r.detail || "",
    })),
    ...items.missingItems.map((it) => ({ field: `Item: ${it}`, where: "system", sourceDocument: "", detail: "Item present in the CHA Checklist but not found in the system documents." })),
    ...items.extraItems.map((it) => ({ field: `Item: ${it}`, where: "checklist", sourceDocument: "", detail: "Item present in the system documents but not in the CHA Checklist." })),
  ];

  return {
    match,
    overallStatus: match ? "match" : "mismatch",
    score: matchPercentage,
    summary: strOr(parsed.summary, "").trim() || (match ? "All important information is consistent across the documents." : "Differences were found between the CHA Checklist and the system documents."),
    dashboard: { totalCompared, totalMatched, totalUnmatched, totalMissing, matchPercentage },
    header,
    items,
    containers,
    certificates,
    issuedRetroactively,
    sims,
    dutyTax,
    matchedFields,
    unmatchedFields,
    missingInfo,
    missingDocuments,
  };
}

// Deterministic mock so the feature works before a key is provisioned.
function mockResult(checklistName, systemNames) {
  const src = systemNames[0] || "";
  const raw = {
    summary:
      "MOCK MODE (no GEMINI_API_KEY configured). Sample categorized output so you can preview the full report. " +
      "Set GEMINI_API_KEY on the server to run a real AI comparison.",
    header: [
      { field: "Invoice Number", checklistValue: "INV-2026-7781", systemValue: "INV-2026-7781", status: "match", sourceDocument: src, detail: "" },
      { field: "Invoice Value", checklistValue: "USD 12,50,000", systemValue: "USD 12,05,000", status: "mismatch", sourceDocument: src, detail: "Invoice value differs." },
      { field: "Consignee Details", checklistValue: "ACME IMPORTS INC", systemValue: "ACME IMPORTS INC", status: "match", sourceDocument: src, detail: "" },
      { field: "MBL / MAWB Number", checklistValue: "OMMBL-2026-7781", systemValue: null, status: "missing_in_system", sourceDocument: "", detail: "Not found in the system documents." },
    ],
    items: {
      rows: [
        { description: "COTTON T-SHIRTS", hsnCode: "6109", quantity: "1000", unit: "PCS", unitPrice: "5.00", totalValue: "5000", countryOfOrigin: "IN", status: "match", sourceDocument: src, detail: "" },
        { description: "COTTON TROUSERS", hsnCode: "6203", quantity: "500", unit: "PCS", unitPrice: "8.00", totalValue: "4000", countryOfOrigin: "IN", status: "mismatch", sourceDocument: src, detail: "Quantity differs (500 vs 450)." },
      ],
      missingItems: ["LEATHER BELTS"],
      extraItems: [],
    },
    containers: [
      { field: "Container Number", checklistValue: "MSKU1234567", systemValue: "MSKU1234567", status: "match", sourceDocument: "Bill of Lading", detail: "" },
      { field: "Seal Number", checklistValue: "SL889900", systemValue: "SL889901", status: "mismatch", sourceDocument: "Bill of Lading", detail: "Seal number differs." },
    ],
    certificates: [
      { field: "Certificate Number", checklistValue: "COO-99812", systemValue: "COO-99812", status: "match", sourceDocument: "Certificate", detail: "" },
    ],
    issuedRetroactively: { present: true, marked: false, sourceDocument: "CEPA TJD-4350", detail: "Field present on the CEPA certificate; checkbox not marked." },
    sims: {
      records: [
        { simsNumber: "2025SIMS0001", simsDate: "12/06/2025", status: "match", sourceDocument: src, detail: "" },
        { simsNumber: "2025SIMS0002", simsDate: "15/06/2025", status: "mismatch", sourceDocument: src, detail: "SIMS Date does not match the uploaded document (15/06/2025 vs 18/06/2025)." },
        { simsNumber: "2025SIMS0003", simsDate: "20/06/2025", status: "missing_in_system", sourceDocument: "", detail: "In the checklist but not found in any SIMS document." },
      ],
    },
    dutyTax: [
      { name: "Basic Customs Duty", amount: "1,25,000", percentage: "10", present: true, matches: null, detail: "" },
      { name: "Social Welfare Surcharge", amount: "12,500", percentage: "10", present: true, matches: null, detail: "" },
      { name: "IGST", amount: "2,47,500", percentage: "18", present: true, matches: null, detail: "" },
    ],
    missingDocuments: [],
  };
  const result = normalizeResult(raw);
  result.mock = true;
  result.summary = raw.summary;
  result.meta = { checklist: checklistName, systemDocuments: systemNames };
  return result;
}

function buildGenerationConfig() {
  const cfg = {
    // temperature 0 = deterministic: identical documents yield identical results.
    temperature: 0,
    topP: 1,
    topK: 1,
    // Generous cap so large item lists are never truncated (truncated JSON was a
    // cause of parse failures / inconsistent results).
    maxOutputTokens: 16384,
    responseMimeType: "application/json",
  };
  // Disable "thinking" on 2.5 Flash — it adds significant latency but little value
  // for this structured-extraction task, so this is the biggest speed win.
  if (geminiConfig.disableThinking && /flash/i.test(geminiConfig.model)) {
    cfg.thinkingConfig = { thinkingBudget: 0 };
  }
  return cfg;
}

async function generateWithRetry(parts) {
  const model = client.getGenerativeModel({
    model: geminiConfig.model,
    generationConfig: buildGenerationConfig(),
  });
  const maxAttempts = 2;
  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await withTimeout(model.generateContent(parts), geminiConfig.aiTimeoutMs, "generateContent");
      const usage = result.response.usageMetadata || {};
      return {
        text: result.response.text(),
        usage: {
          inputTokens: usage.promptTokenCount || 0,
          outputTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        },
      };
    } catch (err) {
      if (isTransient(err && err.message) && attempt < maxAttempts) {
        const wait = 1200 * attempt;
        log("warn", `transient error (attempt ${attempt}/${maxAttempts}); retrying in ${wait}ms`, { error: err.message });
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
}

/* ------------------------- result cache ------------------------- */
// Identical inputs (same file bytes + model + prompt) return the exact same result
// instantly — improving both consistency and performance on repeat comparisons.
const resultCache = new Map(); // key -> { result, at }

function cacheKey(checklist, systemDocs) {
  const h = crypto.createHash("sha256");
  h.update(geminiConfig.model);
  h.update("v4"); // bump when the prompt/output shape changes
  h.update(String(checklist.originalname || ""));
  h.update(checklist.buffer);
  for (const d of systemDocs) {
    h.update(String(d.originalname || ""));
    h.update(d.buffer);
  }
  return h.digest("hex");
}

function cacheGet(key) {
  if (!geminiConfig.cacheTtlMs) return null;
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > geminiConfig.cacheTtlMs) { resultCache.delete(key); return null; }
  return JSON.parse(JSON.stringify(hit.result)); // clone so callers can't mutate the cache
}

function cacheSet(key, result) {
  if (!geminiConfig.cacheTtlMs) return;
  resultCache.set(key, { result, at: Date.now() });
  if (resultCache.size > 100) { // evict oldest to bound memory
    const oldest = [...resultCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) resultCache.delete(oldest[0]);
  }
}

/**
 * Compare a CHA Checklist PDF against one or more system PDFs.
 * @param {{buffer:Buffer, originalname:string, mimetype:string}} checklist
 * @param {Array} systemDocs
 * @returns {Promise<object>} structured comparison result
 */
async function compareChecklist(checklist, systemDocs) {
  const systemNames = systemDocs.map((d) => d.originalname);
  if (geminiConfig.mockMode) {
    return mockResult(checklist.originalname, systemNames);
  }

  const key = cacheKey(checklist, systemDocs);
  const cached = cacheGet(key);
  if (cached) {
    log("info", "cache hit — returning identical result", { checklist: checklist.originalname });
    cached.cached = true;
    return cached;
  }

  const parts = [
    { text: INSTRUCTION },
    { text: `REFERENCE — CHA CHECKLIST document (filename: ${checklist.originalname}):` },
    { inlineData: { mimeType: checklist.mimetype || "application/pdf", data: checklist.buffer.toString("base64") } },
  ];
  systemDocs.forEach((d, i) => {
    parts.push({ text: `SYSTEM DOCUMENT ${i + 1} (filename: ${d.originalname}):` });
    parts.push({ inlineData: { mimeType: d.mimetype || "application/pdf", data: d.buffer.toString("base64") } });
  });

  const { text, usage } = await generateWithRetry(parts);
  const result = normalizeResult(extractJson(text));
  result.meta = { checklist: checklist.originalname, systemDocuments: systemNames, model: geminiConfig.model };
  result.usage = usage;
  cacheSet(key, result);
  log("info", "comparison complete", { match: result.match, score: result.score, ...result.dashboard });
  return result;
}

module.exports = { compareChecklist, describeAiError };
