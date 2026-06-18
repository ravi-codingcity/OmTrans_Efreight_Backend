/* ------------------------------------------------------------------ */
/*  HAWB payload validation                                           */
/*  Drafts may be largely empty; a submitted HAWB must carry the key  */
/*  identifying fields.                                               */
/* ------------------------------------------------------------------ */

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";

const validateHawb = (data, opts = {}) => {
  const errors = [];
  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Invalid request body"] };
  }
  const status = data.status === "submitted" ? "submitted" : "draft";
  if (status === "submitted" || opts.requireSubmitted) {
    if (isBlank(data.shipper)) errors.push("Shipper is required");
    if (isBlank(data.consignee)) errors.push("Consignee is required");
    // House AWB Number is optional — no validation.
  }
  return { valid: errors.length === 0, errors };
};

module.exports = { validateHawb };
