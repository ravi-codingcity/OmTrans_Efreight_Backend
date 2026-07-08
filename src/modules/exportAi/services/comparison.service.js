const { CANONICAL_FIELDS } = require("../utils/constants");

function normalize(value) {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().replace(/[\s,]+/g, " ").replace(/[^\w. ]+/g, "").trim();
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) { best = v; bestCount = c; }
  return best;
}

/** Shipping Bill / LEO / Indian Customs EDI is authoritative — overrides conflicts. */
function isPriorityDoc(doc) {
  if (doc && doc.detectedType === "shipping_bill") return true;
  const hay = `${(doc && doc.originalName) || ""} ${(doc && doc.rawExtraction && doc.rawExtraction.notes) || ""}`.toLowerCase();
  return /shipping\s*bill|\bleo\b|let export order|indian customs edi/.test(hay);
}

/**
 * STRICT LEO/Shipping-Bill identity — used to COUNT shipments in the Multiple-LEO
 * workflow. Unlike isPriorityDoc (which also matches any document that merely
 * mentions a shipping bill in its name/notes — e.g. an Invoice or Shipping
 * Instruction quoting the SB number), this relies only on the document
 * classification, so shared documents never inflate the shipment count.
 */
function isLeoDocument(doc) {
  return Boolean(doc && doc.detectedType === "shipping_bill");
}

/**
 * Supporting documents: CLP, Forwarding Note and Form 13 / E-Gate. These are NEVER LEO
 * documents. They are used only for Seal Number and as a Container-Number fallback, and
 * must never contribute Quantity (PKG) or Gross Weight (G. WT) — the CLP in particular
 * carries CONSOLIDATED totals which would double-count against the per-LEO figures.
 */
function isSupportingDoc(doc) {
  const type = (doc && doc.detectedType) || "";
  if (["clp", "forwarding_note", "form_10", "egate"].includes(type)) return true;
  const nm = `${(doc && doc.originalName) || ""}`.toLowerCase();
  return /\bclp\b|container\s*load\s*plan|forwarding|form[\s_-]*10|form10|e[\s-]?gate|sez[\s-]*4|form[\s_-]*13|form[\s_-]*6(?!\d)/.test(nm);
}

/**
 * Shipping Instruction / Bill of Lading Instructions — the high-priority source for
 * Shipper/Consignee/Notify addresses, Container & Seal numbers, Freight term and Net
 * Weight. (It does NOT override every field; see shipmentReport.service.js.)
 */
function isShippingInstruction(doc) {
  if (doc && doc.detectedType === "shipping_instruction") return true;
  const hay = `${(doc && doc.originalName) || ""} ${(doc && doc.rawExtraction && doc.rawExtraction.notes) || ""}`.toLowerCase();
  return /shipping\s*instruction|bill\s*of\s*lading\s*instruction|b\/?l\s*instruction/.test(hay);
}

function reconcileDocuments(documents) {
  const comparison = [];
  const discrepancies = [];
  const consolidated = {};
  const missingFields = [];
  let weightedScore = 0;
  let consideredCount = 0;

  for (const field of CANONICAL_FIELDS) {
    const sources = [];
    for (const doc of documents) {
      const raw = doc.extractedFields ? doc.extractedFields[field] : undefined;
      if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
        sources.push({ documentId: doc._id, documentName: doc.originalName, value: raw, norm: normalize(raw), priority: isPriorityDoc(doc) });
      }
    }

    if (sources.length === 0) {
      missingFields.push(field);
      comparison.push({ field, status: "missing", consolidatedValue: null, sources: [] });
      continue;
    }

    const distinct = [...new Set(sources.map((s) => s.norm))];
    const sourcePayload = sources.map(({ documentId, documentName, value }) => ({ documentId, documentName, value }));
    consideredCount += 1;

    if (sources.length === 1) {
      consolidated[field] = sources[0].value;
      comparison.push({ field, status: "single_source", consolidatedValue: sources[0].value, sources: sourcePayload });
      weightedScore += 0.75;
    } else if (distinct.length === 1) {
      consolidated[field] = sources[0].value;
      comparison.push({ field, status: "match", consolidatedValue: sources[0].value, sources: sourcePayload });
      weightedScore += 1;
    } else if (sources.some((s) => s.priority)) {
      const winner = sources.find((s) => s.priority);
      consolidated[field] = winner.value;
      comparison.push({ field, status: "single_source", consolidatedValue: winner.value, sources: sourcePayload });
      weightedScore += 1;
    } else {
      const winnerNorm = mostCommon(sources.map((s) => s.norm));
      const winner = sources.find((s) => s.norm === winnerNorm);
      consolidated[field] = winner.value;
      comparison.push({ field, status: "conflict", consolidatedValue: winner.value, sources: sourcePayload });
      discrepancies.push({ field, message: `Conflicting values for "${field}" across ${sources.length} documents`, values: sourcePayload, resolvedTo: winner.value });
    }
  }

  const validationScore = consideredCount === 0 ? 0 : Math.round((weightedScore / consideredCount) * 100);
  return { consolidated, comparison, discrepancies, missingFields, validationScore };
}

module.exports = { isPriorityDoc, isLeoDocument, isSupportingDoc, isShippingInstruction, reconcileDocuments };
