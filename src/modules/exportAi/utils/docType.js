/**
 * Best-effort document-type detection from a file name. Used as a fallback when
 * AI extraction is unavailable and as a hint to the AI. Order matters: specific
 * patterns (Shipping Bill "SB", LEO) before generic ones (Invoice).
 */
function detectDocTypeFromName(name = "") {
  const s = String(name).toLowerCase();
  if (/shipping\s*instruction|b\/?l\s*instruction|bill\s*of\s*lading\s*instruction/.test(s)) return "shipping_instruction";
  if (/shipping\s*bill|\bsb\b|\bleo\b|let\s*export|customs\s*edi/.test(s)) return "shipping_bill";
  if (/booking/.test(s)) return "booking_confirmation";
  if (/forwarding/.test(s)) return "forwarding_note";
  if (/form[\s_-]*10|form10/.test(s)) return "form_10";
  if (/e[\s-]?gate|sez[\s-]*4|form[\s_-]*13|form[\s_-]*6(?!\d)/.test(s)) return "egate";
  if (/packing/.test(s)) return "packing_list";
  if (/invoice|\binv\b/.test(s)) return "commercial_invoice";
  if (/bill\s*of\s*lading|\bb[\s/-]?l\b|\bbol\b|waybill/.test(s)) return "bill_of_lading";
  if (/cert.*orig|\bcoo\b/.test(s)) return "certificate_of_origin";
  if (/insurance|policy/.test(s)) return "insurance_certificate";
  if (/purchase\s*order|\bpo\b/.test(s)) return "purchase_order";
  return "unknown";
}

module.exports = { detectDocTypeFromName };
