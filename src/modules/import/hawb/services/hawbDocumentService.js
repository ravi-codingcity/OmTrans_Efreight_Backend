/* ------------------------------------------------------------------ */
/*  HAWB document service                                             */
/*                                                                    */
/*  Sanitizes the 19 user-fillable HAWB fields and builds the         */
/*  combined "Nature and Quantity of Goods" content. The actual PDF   */
/*  is rendered client-side onto the real HAWB template.              */
/* ------------------------------------------------------------------ */

const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

const DEFAULT_HANDLING =
  "BOXES ADDED AND MKD.// ONE ENV CONTG DOCS ( H.AWB, MANIFEST, INVOICE, PACKING LIST ) ATTD WITH THE SHPT.";

// Format any date value to DD/MM/YYYY (documents/display use this format).
const formatDMY = (val) => {
  const s = str(val);
  if (!s) return "";
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return s;
};

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

  handling_information:
    body.handling_information !== undefined ? str(body.handling_information) : DEFAULT_HANDLING,

  no_of_pieces: str(body.no_of_pieces),
  gross_weight: str(body.gross_weight),
  chargeable_weight: str(body.chargeable_weight),

  nature_of_goods: str(body.nature_of_goods),
  invoice_no: str(body.invoice_no),
  invoice_date: str(body.invoice_date),
  hsn_code: str(body.hsn_code),
  dimension: str(body.dimension),
  volume_wt: str(body.volume_wt),

  dated: str(body.dated),

  status: body.status === "submitted" ? "submitted" : "draft",
  createdBy: str(body.createdBy) || str(user.fullName) || str(user.username),
  createdByRole: str(body.createdByRole) || str(user.role),
  createdByLocation: str(body.createdByLocation) || str(user.location),
});

// Nature of Goods, Invoice No, Invoice Date, HSN Code, Dimension and Volume WT
// are combined into the single "Nature and Quantity of Goods (Incl. Dimensions
// or Value)" box, as grouped blocks separated by blank lines.
const buildNatureOfGoods = (o = {}) => {
  const groups = [];
  if (str(o.nature_of_goods)) groups.push(str(o.nature_of_goods));
  const inv = [];
  if (str(o.invoice_no)) inv.push(`INV. NO: ${str(o.invoice_no)}`);
  if (str(o.invoice_date)) inv.push(`DT. ${formatDMY(o.invoice_date)}`);
  if (inv.length) groups.push(inv.join("\n"));
  if (str(o.hsn_code)) groups.push(`HSCODE: ${str(o.hsn_code)}`);
  if (str(o.dimension)) groups.push(`DIMS IN CMS:\n${str(o.dimension)}`);
  if (str(o.volume_wt)) groups.push(`VOLUME WT: ${str(o.volume_wt)}`);
  return groups.join("\n\n");
};

const buildDocumentModel = (doc) => {
  const o = doc && typeof doc.toObject === "function" ? doc.toObject() : doc || {};
  return {
    id: o._id,
    ...o,
    dated: formatDMY(o.dated),
    nature_combined: buildNatureOfGoods(o),
  };
};

module.exports = { sanitizeHawbPayload, buildNatureOfGoods, buildDocumentModel };
