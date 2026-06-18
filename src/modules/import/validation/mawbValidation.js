/* ------------------------------------------------------------------ */
/*  MAWB payload validation                                           */
/*                                                                    */
/*  Drafts may be largely empty; a submitted AWB Instruction must     */
/*  carry the key identifying fields.                                 */
/* ------------------------------------------------------------------ */

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

/**
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

  if (status === "submitted" || opts.requireSubmitted) {
    if (isBlank(data.shipper)) errors.push("Shipper is required");
    if (isBlank(data.consignee)) errors.push("Consignee is required");
    // HAWB Nos is optional — no validation.
  }

  return { valid: errors.length === 0, errors };
};

module.exports = { validateMawb };
