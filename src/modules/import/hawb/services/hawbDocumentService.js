/* ------------------------------------------------------------------ */
/*  HAWB document service                                             */
/*                                                                    */
/*  Sanitizes the 19 user-fillable HAWB fields and builds the         */
/*  combined "Nature and Quantity of Goods" content. The actual PDF   */
/*  is rendered client-side onto the real HAWB template.              */
/* ------------------------------------------------------------------ */

const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

const sanitizeHawbPayload = (body = {}, user = {}) => ({
  airport_of_departure: str(body.airport_of_departure),
  airport_of_destination: str(body.airport_of_destination),
  master_awb_number: str(body.master_awb_number),
  house_awb_number: str(body.house_awb_number),

  shipper: str(body.shipper),
  consignee: str(body.consignee),
  notify: str(body.notify),

  routing_airport_of_departure: str(body.routing_airport_of_departure),
  routing_to: str(body.routing_to),
  routing_airport_of_destination: str(body.routing_airport_of_destination),

  no_of_pieces: str(body.no_of_pieces),
  gross_weight: str(body.gross_weight),
  chargeable_weight: str(body.chargeable_weight),

  hsn_code: str(body.hsn_code),
  invoice_no: str(body.invoice_no),
  nature_date: str(body.nature_date),
  dimension: str(body.dimension),
  volume_wt: str(body.volume_wt),

  dated: str(body.dated),

  status: body.status === "submitted" ? "submitted" : "draft",
  createdBy: str(body.createdBy) || str(user.fullName) || str(user.username),
  createdByRole: str(body.createdByRole) || str(user.role),
  createdByLocation: str(body.createdByLocation) || str(user.location),
});

// Special logic: HSN Code, Invoice No, Date, Dimension, Volume WT are combined
// into the single "Nature and Quantity of Goods (Incl. Dimensions or Value)" box.
const buildNatureOfGoods = (o = {}) => {
  const lines = [];
  if (str(o.hsn_code)) lines.push(`HSN Code: ${str(o.hsn_code)}`);
  if (str(o.invoice_no)) lines.push(`Invoice No: ${str(o.invoice_no)}`);
  if (str(o.nature_date)) lines.push(`Date: ${str(o.nature_date)}`);
  if (str(o.dimension)) lines.push(`Dimension: ${str(o.dimension)}`);
  if (str(o.volume_wt)) lines.push(`Volume WT: ${str(o.volume_wt)}`);
  return lines.join("\n");
};

const buildDocumentModel = (doc) => {
  const o = doc && typeof doc.toObject === "function" ? doc.toObject() : doc || {};
  return { id: o._id, ...o, nature_combined: buildNatureOfGoods(o) };
};

module.exports = { sanitizeHawbPayload, buildNatureOfGoods, buildDocumentModel };
