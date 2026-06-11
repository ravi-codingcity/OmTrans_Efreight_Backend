/* ------------------------------------------------------------------ */
/*  MAWB payload validation                                           */
/*                                                                    */
/*  Lightweight, dependency-free validator. Drafts are allowed to be  */
/*  largely empty; submitted records must carry the key identifying   */
/*  fields of an AWB Instruction.                                     */
/* ------------------------------------------------------------------ */

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

/**
 * Validate a MAWB payload.
 * @param {object} data  request body
 * @param {object} opts  { requireSubmitted: boolean }
 * @returns {{ valid: boolean, errors: string[] }}
 */
const validateMawb = (data, opts = {}) => {
  const errors = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Invalid request body"] };
  }

  const status = data.status === "submitted" ? "submitted" : "draft";

  // Only enforce required fields for a final submission.
  if (status === "submitted" || opts.requireSubmitted) {
    const shipper = data.shipper || {};
    const consignee = data.consignee || {};
    const airline = data.airline_information || {};

    if (isBlank(shipper.company_name)) {
      errors.push("Shipper company name is required");
    }
    if (isBlank(consignee.company_name)) {
      errors.push("Consignee company name is required");
    }
    if (isBlank(airline.airline_name)) {
      errors.push("Airline name is required");
    }
    if (isBlank(airline.mawb_number)) {
      errors.push("MAWB number is required");
    }
  }

  // Email sanity (only when provided)
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const checkEmail = (val, label) => {
    if (!isBlank(val) && !emailRe.test(String(val).trim())) {
      errors.push(`${label} email is invalid`);
    }
  };
  checkEmail(data.shipper && data.shipper.email, "Shipper");
  checkEmail(data.consignee && data.consignee.email, "Consignee");
  checkEmail(data.notify_party && data.notify_party.email, "Notify party");

  return { valid: errors.length === 0, errors };
};

module.exports = { validateMawb };
