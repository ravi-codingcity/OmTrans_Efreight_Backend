const { GoogleGenerativeAI } = require("@google/generative-ai");
const { aiConfig } = require("../config/aiConfig");
const { logger } = require("../config/logger");
const { CANONICAL_FIELDS, DOC_TYPES } = require("../utils/constants");
const { DEFAULT_MODEL, resolveModel } = require("../config/aiModels");
const { fileToBase64 } = require("../utils/files");
const { detectDocTypeFromName } = require("../utils/docType");
const { buildMockExtraction } = require("./mock.service");
const { prepareForGemini } = require("./extractText.service");

function describeAiError(err) {
  const m = String((err && err.message) || err || "");
  if (/prepayment|credits?\s*(are\s*)?depleted|billing/i.test(m)) return { code: "AI_CREDITS", message: "Gemini AI credits depleted — please top up billing in Google AI Studio" };
  if (/API[_\s]?key.*(not valid|invalid)|API_KEY_INVALID|invalid api key|\b401\b|\b403\b|permission/i.test(m)) return { code: "AI_AUTH", message: "Invalid or unauthorized Gemini API key" };
  if (/\b429\b|quota|rate.?limit|too many/i.test(m)) return { code: "AI_QUOTA", message: "Gemini quota / rate limit exceeded — try again later" };
  if (/\b(503|500)\b|overloaded|unavailable|high demand/i.test(m)) return { code: "AI_OVERLOADED", message: "Gemini AI is temporarily overloaded — please retry" };
  if (/no json|json/i.test(m)) return { code: "PARSE", message: "Document parsing failed (unexpected AI response)" };
  if (/ENOENT|no such file|read/i.test(m)) return { code: "FILE", message: "Uploaded file could not be read" };
  return { code: "UNKNOWN", message: m || "Unknown error during analysis" };
}

let client = null;
if (!aiConfig.gemini.mockMode) {
  client = new GoogleGenerativeAI(aiConfig.gemini.apiKey);
  logger.info(`Gemini live mode (default model: ${aiConfig.gemini.model})`);
} else {
  logger.warn("GEMINI_API_KEY not set — Export-AI running in MOCK mode (no external AI calls).");
}

const EXTRACTION_INSTRUCTION = `You are an expert export/trade documentation analyst.
You will receive a single export-related document (PDF, spreadsheet, Word file, or a
scanned image). Read it thoroughly — headers, tables, stamps, footnotes, and any values
embedded inside paragraphs, notes, shipping instructions, or email text.

Use SEMANTIC understanding, not exact keyword matching. Map equivalent terminology,
abbreviations and alternate field names to the canonical keys. Examples (non-exhaustive):
- "POD", "Discharge Port", "Port of Destination" -> port_of_discharge
- "POL", "Loading Port" -> port_of_loading
- "Shipper", "Exporter", "Seller", "From", "Exporter's Name & Address", "Exporter Name and Address" -> exporter_name (+ exporter_address)
- "Consignee", "Buyer", "Bill To", "To" -> consignee_name
- "Notify", "Notify Party", "Also Notify" -> notify_party
- "Container No", "CONTAINER NUMBER", "CNTR", "Equipment No" -> container_number / containers[].containerNo
- "Seal No", "Carrier Seal" -> seal_number / containers[].sealNo / seals[]
- "Liner Seal No.", "Line Seal No.", "Shipping Line Seal" -> liner_seal_number / containers[].linerSeal / seals[]
- "Agent Seal No." (e.g. on a CLP / Container Load Plan) -> agent_seal_number / containers[].agentSeal / seals[]
- "Customs Seal No.", "Custom Seal No.", "Cust Seal No." -> customs_seal_number / containers[].customsSeal / seals[]
- "Freight", "PREPAID", "COLLECT", "FREIGHT PREPAID", "FREIGHT COLLECT", "Freight Terms" -> freight (keep the ORIGINAL wording verbatim)
- "GW", "Gross Wt" -> total_gross_weight ; "NW", "Net Wt", "Net Weight" -> total_net_weight
- "CBM", "Measurement", "Volume" -> gross_measurement
- "HS Code", "HSN", "HTS", "Tariff No" -> hs_code / hsCodes[]
- "Vessel", "Ocean Vessel" -> vessel_name ; "Voyage", "Voy No" -> voyage_number
- "SB No", "Shipping Bill No" -> shipping_bill_number ; "SB Date" -> shipping_bill_date
- "IEC", "IEC No", "BIN" -> iec_number
- "Number of Container", "No. of Containers" -> number_of_containers
- "Booking No", "Booking Ref", "Carrier Booking No" -> booking_number
- ESTIMATED DEPARTURE -> vessel_etd (capture "PORT, COUNTRY, DD/MM/YYYY"); appears on Booking Confirmations.
- ESTIMATED ARRIVAL -> vessel_eta (capture "PORT, COUNTRY, DD/MM/YYYY").

DOCUMENT TYPE:
- "Shipping Instruction", "Shipping Instructions", "Bill of Lading Instructions", "B/L Instructions" -> detectedType="shipping_instruction" (HIGH-PRIORITY source).
- "Shipping Bill", "LEO", "Let Export Order", "INDIAN CUSTOMS EDI SYSTEM" -> detectedType="shipping_bill" (primary source).
- "Booking Confirmation", "Booking Note" -> detectedType="booking_confirmation".
- "Forwarding Note" -> detectedType="forwarding_note".
- "Form 10", "FORM 10" -> detectedType="form_10".
- "Form 13", "Form 6", "SEZ 4 E-Gatepass", "E-GATE FORM" -> detectedType="egate" (extract Line Seal No. + Custom Seal No.).
- "CLP", "Container Load Plan" -> detectedType="clp" (extract Agent Seal No. + Custom Seal No.).

SHIPPING INSTRUCTION: this is the authoritative source for Shipper/Consignee/Notify Party
addresses, Container No. / Liner Seal No. / Customs Seal No., the FREIGHT term (e.g. "FREIGHT
PREPAID"/"COLLECT" — keep verbatim) and Net Weight. Extract all of these whenever present.

ADDRESS RULE: capture the COMPLETE address verbatim into exporter_address / consignee_address /
notify_party_address — never truncate. For notify party, put the full company name in notify_party
and the rest in notify_party_address; if "SAME AS CONSIGNEE", copy the consignee's full name + address.

FORWARDING NOTE: extract EVERY seal number into "seals" (do not merge).
FORM 10 / E-GATE / FORM 13: extract EVERY "Line Seal No." AND "Custom Seal No." into "seals"
and set containers[].linerSeal / containers[].customsSeal (or containers[].sealNo) per row; also
extract the printed "Booking No." into booking_number.
CLP (Container Load Plan): extract "Agent Seal No." into containers[].agentSeal and "Custom Seal
No." into containers[].customsSeal (and into "seals"), keyed to each container row.

Return ONLY a JSON object with this exact shape:
{
  "detectedType": one of ${JSON.stringify(DOC_TYPES)},
  "confidence": number between 0 and 1,
  "fields": {
    ${CANONICAL_FIELDS.map((f) => `"${f}": string|null`).join(",\n    ")}
  },
  "hsCodes": [ string ],
  "seals": [ string ],
  "containers": [ { "containerNo": string, "sealNo": string, "linerSeal": string, "agentSeal": string, "customsSeal": string, "size": string, "marks": string, "packages": string, "weight": string } ],
  "lineItems": [ { "description": string, "quantity": string, "unitPrice": string, "amount": string, "hsCode": string } ],
  "notes": string
}
Rules:
- ONE lineItems entry per product line, pairing each description with its own HS/HSN code.
- Capture EVERY container and EVERY HS code — never collapse multiples into one.
- Normalise dates to YYYY-MM-DD. Keep currency codes ISO. Do NOT invent values — use null when absent.`;

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in model response");
  return JSON.parse(candidate.slice(start, end + 1));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isPermanent = (m) => /prepayment|credits?\s*(are\s*)?depleted|billing|API[_\s]?key.*(not valid|invalid)|API_KEY_INVALID|\b401\b|\b403\b/i.test(m);
const isTransient = (err) => {
  const m = (err && err.message) || "";
  if (isPermanent(m)) return false;
  return /\b(503|429|500|UNAVAILABLE|overloaded|high demand|timeout)\b/i.test(m);
};

async function generateWithFallback(requestedModel, parts, generationConfig) {
  const chain = [...new Set([resolveModel(requestedModel), DEFAULT_MODEL, "gemini-2.5-flash-lite"])];

  const tryModel = async (modelId) => {
    const model = client.getGenerativeModel({ model: modelId, generationConfig });
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await model.generateContent(parts);
        const u = result.response.usageMetadata || {};
        const usage = {
          inputTokens: u.promptTokenCount || 0,
          outputTokens: u.candidatesTokenCount || 0,
          totalTokens: u.totalTokenCount || (u.promptTokenCount || 0) + (u.candidatesTokenCount || 0),
        };
        return { text: result.response.text(), usedModel: modelId, usage };
      } catch (err) {
        if (isTransient(err) && attempt < maxAttempts) {
          const wait = 1200 * attempt;
          logger.warn(`Model "${modelId}" transient error (attempt ${attempt}/${maxAttempts}); retrying in ${wait}ms`);
          await sleep(wait);
          continue;
        }
        throw err;
      }
    }
  };

  let lastErr;
  for (const modelId of chain) {
    try {
      return await tryModel(modelId);
    } catch (err) {
      lastErr = err;
      logger.warn(`Model "${modelId}" failed (${err.message}); trying next fallback`);
    }
  }
  throw lastErr;
}

async function extractDocument({ filePath, mimeType, originalName, model }) {
  if (aiConfig.gemini.mockMode) {
    return { ...buildMockExtraction({ originalName, mimeType }), usedModel: "mock", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  }

  // Office formats (DOC/DOCX/XLS/XLSX/CSV) are not valid Gemini inline uploads — we
  // extract & normalize their text locally and send that. PDFs/images go inline.
  const prepared = await prepareForGemini({ filePath, mimeType, originalName });
  const documentPart = prepared.mode === "text"
    ? { text: `Extracted document content (plain text):\n\n${prepared.text}` }
    : { inlineData: { mimeType, data: await fileToBase64(filePath) } };

  const { text, usedModel, usage } = await generateWithFallback(
    model,
    [
      { text: EXTRACTION_INSTRUCTION },
      { text: `Document filename: ${originalName}` },
      documentPart,
    ],
    { temperature: 0.1, responseMimeType: "application/json" }
  );

  const parsed = extractJson(text);
  const aiType = DOC_TYPES.includes(parsed.detectedType) ? parsed.detectedType : "unknown";
  const detectedType = aiType !== "unknown" ? aiType : detectDocTypeFromName(originalName);
  return {
    detectedType,
    confidence: Number(parsed.confidence) || 0.5,
    fields: parsed.fields || {},
    hsCodes: Array.isArray(parsed.hsCodes) ? parsed.hsCodes.filter(Boolean).map(String) : [],
    seals: Array.isArray(parsed.seals) ? parsed.seals.filter(Boolean).map(String) : [],
    containers: Array.isArray(parsed.containers) ? parsed.containers.filter((c) => c && (c.containerNo || c.sealNo || c.linerSeal || c.agentSeal || c.customsSeal)) : [],
    lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
    notes: parsed.notes || "",
    usedModel,
    usage: usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

async function summarizeReconciliation({ comparison, discrepancies, missingFields, validationScore, model }) {
  const deterministic = () => {
    const conflicts = discrepancies.length;
    const missing = missingFields.length;
    const matched = comparison.filter((c) => c.status === "match").length;
    return (
      `Cross-document validation complete with an overall consistency score of ${validationScore}%. ` +
      `${matched} field(s) matched across sources, ${conflicts} conflict(s) detected, and ` +
      `${missing} expected field(s) were missing. ` +
      (conflicts ? "Review the flagged conflicts before releasing the shipment documentation." : "No blocking conflicts were found across the provided documents.")
    );
  };
  if (aiConfig.gemini.mockMode) return deterministic();
  try {
    const prompt = `You are an export compliance reviewer. Given this JSON reconciliation result,
write a clear 4-6 sentence executive summary highlighting matches, conflicts, missing fields,
and a recommendation. Be specific about field names.\n\n${JSON.stringify({ comparison, discrepancies, missingFields, validationScore }, null, 2)}`;
    const { text } = await generateWithFallback(model, prompt, { temperature: 0.2 });
    return text.trim() || deterministic();
  } catch (err) {
    logger.warn("Summary generation failed, using deterministic fallback", { error: err.message });
    return deterministic();
  }
}

async function verifyGemini(model = DEFAULT_MODEL) {
  if (aiConfig.gemini.mockMode) return { ok: false, error: "mock mode (no API key)" };
  try {
    const { usedModel } = await generateWithFallback(model, "Reply with the single word: ok", { temperature: 0 });
    return { ok: true, model: usedModel };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { describeAiError, extractDocument, summarizeReconciliation, verifyGemini };
