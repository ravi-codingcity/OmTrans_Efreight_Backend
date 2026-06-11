/* ------------------------------------------------------------------ */
/*  MAWB document service                                             */
/*                                                                    */
/*  Reproduces the OmTrans "AWB INSTRUCTION" template EXACTLY. Only   */
/*  the 16 user-fillable fields are populated; every other template   */
/*  box is preserved but left blank. No custom layout is introduced.  */
/* ------------------------------------------------------------------ */

const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

// The 16 fillable fields, sanitized into the model shape.
const sanitizeMawbPayload = (body = {}, user = {}) => ({
  shipper: str(body.shipper),
  consignee: str(body.consignee),
  notify: str(body.notify),
  from_routing: str(body.from_routing),
  to_routing: str(body.to_routing),
  freight: str(body.freight) || "PP",
  hawb_nos: str(body.hawb_nos),
  airport_of_destination: str(body.airport_of_destination),
  handling_information: str(body.handling_information),
  no_of_pcs: str(body.no_of_pcs),
  gross_weight: str(body.gross_weight),
  chargeable_weight: str(body.chargeable_weight),
  nature_of_goods: str(body.nature_of_goods),
  hsn_code: str(body.hsn_code),
  goods_dimension: str(body.goods_dimension),
  date: str(body.date),
  status: body.status === "submitted" ? "submitted" : "draft",
  createdBy: str(body.createdBy) || str(user.fullName) || str(user.username),
  createdByRole: str(body.createdByRole) || str(user.role),
  createdByLocation: str(body.createdByLocation) || str(user.location),
});

// Special logic: HSN Code + Goods Dimension are appended into the single
// "Nature & quantity of goods (incl. dimensions or volume)" template box.
const buildNatureOfGoods = (o = {}) => {
  const lines = [];
  if (str(o.nature_of_goods)) lines.push(str(o.nature_of_goods));
  if (str(o.hsn_code)) lines.push(`HSN Code: ${str(o.hsn_code)}`);
  if (str(o.goods_dimension)) lines.push(`Dimensions: ${str(o.goods_dimension)}`);
  return lines.join("\n");
};

const buildDocumentModel = (doc) => {
  const o = doc && typeof doc.toObject === "function" ? doc.toObject() : doc || {};
  return { id: o._id, ...o, nature_combined: buildNatureOfGoods(o) };
};

const esc = (v) =>
  String(v === undefined || v === null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const nl2br = (v) => esc(v).replace(/\n/g, "<br>");

/* ------------------------------------------------------------------ */
/*  Exact AWB INSTRUCTION template (HTML — Word/preview compatible)   */
/*  Box/label order mirrors the uploaded MAWB FORMAT.doc precisely.   */
/* ------------------------------------------------------------------ */
const renderMawbHtml = (doc) => {
  const o = buildDocumentModel(doc);
  const b = "border:1px solid #000;";
  const cell = `${b}padding:5px;font-size:11px;vertical-align:top;`;
  const lbl = "font-size:9px;color:#333;font-weight:bold;text-transform:uppercase;display:block;margin-bottom:2px;";

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>AWB Instruction</title></head>
<body style="font-family:Arial,sans-serif;color:#000;">
  <div style="text-align:center;font-size:16px;font-weight:bold;margin-bottom:6px;">AWB INSTRUCTION</div>
  <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
    <!-- SHIPPER + Accounting Information -->
    <tr>
      <td style="${cell}width:55%;height:90px;">
        <span style="${lbl}">Shipper</span>${nl2br(o.shipper)}
      </td>
      <td style="${cell}width:45%;">
        <span style="${lbl}">Accounting Information</span>
        FREIGHT: ${esc(o.freight)}<br>
        HAWB NOS: ${esc(o.hawb_nos)}<br>
        Agent's IATA Code:<br>
        Account number:
      </td>
    </tr>
    <!-- CONSIGNEE -->
    <tr><td style="${cell}height:80px;" colspan="2"><span style="${lbl}">Consignee</span>${nl2br(o.consignee)}</td></tr>
    <!-- NOTIFY -->
    <tr><td style="${cell}height:70px;" colspan="2"><span style="${lbl}">Notify</span>${nl2br(o.notify)}</td></tr>
    <!-- Airport of departure & requested routing -->
    <tr>
      <td style="${cell}" colspan="2">
        <span style="${lbl}">Airport of departure (Address of first carrier) &amp; requested routing</span>
        <table style="width:100%;border-collapse:collapse;margin-top:3px;">
          <tr>
            <td style="${b}padding:3px;font-size:10px;width:33%;"><span style="${lbl}">From</span>${esc(o.from_routing)}</td>
            <td style="${b}padding:3px;font-size:10px;width:33%;"><span style="${lbl}">By First Carrier</span></td>
            <td style="${b}padding:3px;font-size:10px;width:34%;"><span style="${lbl}">To</span>${esc(o.to_routing)}</td>
          </tr>
        </table>
        <table style="width:100%;border-collapse:collapse;margin-top:3px;">
          <tr>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Currency</span>INR</td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Chgs Code</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Declared Value for carriage</span>NVD</td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Declared value for customs</span>NCV</td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Airport of Destination / Flight / Date / Insurance -->
    <tr>
      <td style="${cell}" colspan="2">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${b}padding:3px;font-size:10px;width:40%;"><span style="${lbl}">Airport of Destination</span>${esc(o.airport_of_destination)}</td>
            <td style="${b}padding:3px;font-size:10px;width:20%;"><span style="${lbl}">Flight</span></td>
            <td style="${b}padding:3px;font-size:10px;width:20%;"><span style="${lbl}">Date</span>${esc(o.date)}</td>
            <td style="${b}padding:3px;font-size:10px;width:20%;"><span style="${lbl}">Amount of insurance</span></td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Handling Information -->
    <tr><td style="${cell}height:40px;" colspan="2"><span style="${lbl}">Handling Information</span>${nl2br(o.handling_information)}</td></tr>
    <!-- Rate / cargo line -->
    <tr>
      <td style="${cell}" colspan="2">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">No. of Pcs</span>${esc(o.no_of_pcs)}</td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Gross Weight</span>${esc(o.gross_weight)}</td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Commd. Item No.</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Chargeable weight</span>${esc(o.chargeable_weight)}</td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Rate/Charge</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Total</span></td>
          </tr>
          <tr>
            <td style="${b}padding:5px;font-size:10px;height:90px;vertical-align:top;" colspan="6">
              <span style="${lbl}">Nature &amp; quantity of goods (incl. dimensions or volume)</span>
              ${nl2br(o.nature_combined)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Charges summary (template fields, left blank) -->
    <tr>
      <td style="${cell}" colspan="2">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Prepaid</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Collect</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Other Charges</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Valuation Charge</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Tax</span></td>
          </tr>
          <tr>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Total other charges Due agent</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Total other charges Due carrier</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Total prepaid</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Total</span></td>
            <td style="${b}padding:3px;font-size:9px;"><span style="${lbl}">Currency Conv. Rates</span></td>
          </tr>
          <tr>
            <td style="${b}padding:3px;font-size:9px;" colspan="5"><span style="${lbl}">Coll. Chgs. In dest currency</span></td>
          </tr>
        </table>
      </td>
    </tr>
    <!-- Footer / declaration (fixed template text) -->
    <tr>
      <td style="${cell}" colspan="2">
        Executed on &nbsp; Date: ${esc(o.date)} &nbsp;&nbsp; Place: ____________________<br><br>
        <strong>OMTRANS LOGISTICS LTD</strong><br>
        Signature of Shipper or his Agent
      </td>
    </tr>
  </table>
</body></html>`;
};

module.exports = {
  sanitizeMawbPayload,
  buildDocumentModel,
  buildNatureOfGoods,
  renderMawbHtml,
};
