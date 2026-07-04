const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiConfig } = require("../config/geminiConfig");

/* ------------------------------------------------------------------ */
/*  AI comparison service — CHA Checklist vs. system PDF document(s).  */
/*  All Gemini logic is isolated here. Given the checklist PDF and one  */
/*  or more system PDFs, it returns a structured comparison report.     */
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

const INSTRUCTION = `You are an expert Indian customs documentation verifier.

INPUTS:
1. The CHA "CHECK LIST - BILL OF ENTRY FOR HOME CONSUMPTION" (the REFERENCE). It is a
   CONSOLIDATED document — its values are gathered from several supporting documents.
2. One or more SYSTEM documents provided by the importer. These may be an Invoice, Packing
   List, HAWB, MAWB, Bill of Lading, Purchase Order or other supporting import documents —
   each contributing part of the information.

METHOD (semantic, not label-matching):
- Extract structured information from the CHA Checklist.
- Extract structured information from EVERY system document, then MERGE them into ONE
  consolidated view of the shipment (a value may appear in only one of the system documents).
- Field names/labels WILL differ between documents (e.g. "Consignee" vs "Importer", "Invoice
  Value" vs "Assessable Value", "AWB No" vs "Airway Bill"). Match fields by MEANING/CONTEXT,
  not by identical labels.
- Compare the ACTUAL business VALUES between the checklist and the merged system view.
- IGNORE differences of formatting, fonts, spacing, layout, letter case, punctuation, date
  format and trivial abbreviations. Normalise before comparing (e.g. numbers, weights,
  currency, dates).

FIELDS to reconcile wherever present: Bill of Entry no & date, IEC, Importer/Consignee name &
address, Supplier/Exporter name & address, Invoice no & date & value & currency, Purchase
Order, Country of Origin/Consignment, Port of Loading/Discharge, HS/CTH/Tariff codes,
Description of goods, Quantity & unit, Gross/Net weight, No. of packages, Assessable value,
Exchange rate, Duty, BL/AWB/Container numbers, Vessel/Flight, Marks & Numbers.

CLASSIFY every material difference as one of:
  - "mismatch"            : present in both but the values differ,
  - "incorrect"           : a value appears wrong/invalid/inconsistent,
  - "missing_in_system"   : in the checklist but NOT found in ANY system document
                            (may indicate a missing supporting document),
  - "missing_in_checklist": in the system documents but NOT in the checklist,
  - "inconsistency"       : any other detected inconsistency (incl. conflicting values across
                            the system documents themselves).

Return ONLY a JSON object with EXACTLY this shape:
{
  "match": boolean,
  "score": number,
  "summary": string,
  "matchedFields": [ { "field": string, "value": string, "sourceDocument": string } ],
  "differences": [
    {
      "field": string,
      "type": "mismatch" | "incorrect" | "missing_in_system" | "missing_in_checklist" | "inconsistency",
      "checklistValue": string | null,
      "systemValue": string | null,
      "sourceDocument": string | null,
      "detail": string
    }
  ],
  "missingDocuments": [ string ]
}
- "sourceDocument" is the filename of the system document a value came from (or null/"" if unknown).
- "missingDocuments" lists any supporting document the checklist clearly relies on but which was
  not provided among the system documents (else an empty array).
- "score" is overall consistency 0-100.
- "match" MUST be false if "differences" contains ANY mismatch / incorrect / missing_in_system item.
- Do NOT invent values — use null when a value is absent. Return valid JSON only, no prose.`;

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

// Normalize whatever the model returns into the strict result shape.
function normalizeResult(parsed) {
  const diffTypes = ["mismatch", "incorrect", "missing_in_system", "missing_in_checklist", "inconsistency"];
  const differences = Array.isArray(parsed.differences)
    ? parsed.differences
        .filter((d) => d && (d.field || d.detail))
        .map((d) => ({
          field: String(d.field || "").trim() || "—",
          type: diffTypes.includes(d.type) ? d.type : "inconsistency",
          checklistValue: d.checklistValue == null ? null : String(d.checklistValue),
          systemValue: d.systemValue == null ? null : String(d.systemValue),
          sourceDocument: d.sourceDocument == null ? "" : String(d.sourceDocument),
          detail: String(d.detail || "").trim(),
        }))
    : [];
  const matchedFields = Array.isArray(parsed.matchedFields)
    ? parsed.matchedFields
        .filter((f) => f && f.field)
        .map((f) => ({ field: String(f.field), value: f.value == null ? "" : String(f.value), sourceDocument: f.sourceDocument == null ? "" : String(f.sourceDocument) }))
    : [];
  const missingDocuments = Array.isArray(parsed.missingDocuments)
    ? parsed.missingDocuments.filter(Boolean).map(String)
    : [];

  const blocking = differences.some((d) => ["mismatch", "incorrect", "missing_in_system"].includes(d.type)) || missingDocuments.length > 0;
  const match = parsed.match === true && !blocking;
  let score = Number(parsed.score);
  if (!Number.isFinite(score)) score = match ? 100 : Math.max(0, 100 - differences.length * 10);
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    match,
    score,
    summary: String(parsed.summary || "").trim() || (match ? "The documents are consistent." : "Differences were found between the documents."),
    matchedFields,
    differences,
    missingDocuments,
    counts: {
      matched: matchedFields.length,
      differences: differences.length,
      mismatched: differences.filter((d) => d.type === "mismatch" || d.type === "incorrect").length,
      missingInSystem: differences.filter((d) => d.type === "missing_in_system").length,
      missingInChecklist: differences.filter((d) => d.type === "missing_in_checklist").length,
      missingDocuments: missingDocuments.length,
    },
  };
}

// Deterministic mock so the feature works before a key is provisioned.
function mockResult(checklistName, systemNames) {
  return {
    mock: true,
    match: false,
    score: 82,
    summary:
      "MOCK MODE (no GEMINI_API_KEY configured). This is sample output so you can preview the workflow. " +
      "Set GEMINI_API_KEY on the server to run a real AI comparison of the CHA Checklist against your system documents.",
    matchedFields: [
      { field: "Importer Name", value: "(sample) matched", sourceDocument: systemNames[0] || "" },
      { field: "Invoice Number", value: "(sample) matched", sourceDocument: systemNames[0] || "" },
    ],
    differences: [
      { field: "Assessable Value", type: "mismatch", checklistValue: "(sample) 12,50,000", systemValue: "(sample) 12,05,000", sourceDocument: systemNames[0] || "", detail: "Sample mismatch — enable live AI for real results." },
      { field: "HS Code", type: "missing_in_system", checklistValue: "(sample) 61103010", systemValue: null, sourceDocument: "", detail: "Sample missing field — enable live AI for real results." },
    ],
    missingDocuments: [],
    counts: { matched: 2, differences: 2, mismatched: 1, missingInSystem: 1, missingInChecklist: 0, missingDocuments: 0 },
    meta: { checklist: checklistName, systemDocuments: systemNames },
  };
}

async function generateWithRetry(parts) {
  const model = client.getGenerativeModel({
    model: geminiConfig.model,
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
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
  log("info", "comparison complete", { match: result.match, score: result.score, diffs: result.counts.differences });
  return result;
}

module.exports = { compareChecklist, describeAiError };
