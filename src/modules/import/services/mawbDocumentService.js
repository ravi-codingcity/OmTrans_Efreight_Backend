/* ------------------------------------------------------------------ */
/*  MAWB document service                                             */
/*                                                                    */
/*  - sanitizeMawbPayload : normalize an incoming body into the model */
/*    shape (defensive defaults, type coercion).                      */
/*  - buildDocumentModel  : produce a clean, fully-mapped document    */
/*    object for preview / client rendering.                          */
/*  - renderMawbHtml      : render the AWB Instruction as HTML (used  */
/*    for Word-compatible .doc download straight from the backend).   */
/* ------------------------------------------------------------------ */

const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const arr = (v) => (Array.isArray(v) ? v : []);

const sanitizeMawbPayload = (body = {}, user = {}) => {
  const s = body.shipper || {};
  const c = body.consignee || {};
  const n = body.notify_party || {};
  const a = body.airline_information || {};
  const r = body.routing_information || {};
  const val = body.valuation_information || {};
  const sd = body.shipment_details || {};
  const ch = body.charges || {};
  const dec = body.shipper_declaration || {};

  return {
    shipper: {
      company_name: str(s.company_name),
      address_line_1: str(s.address_line_1),
      address_line_2: str(s.address_line_2),
      city: str(s.city),
      state: str(s.state),
      postal_code: str(s.postal_code),
      country: str(s.country),
      phone: str(s.phone),
      fax: str(s.fax),
      contact_person: str(s.contact_person),
      email: str(s.email),
    },
    consignee: {
      company_name: str(c.company_name),
      address_line_1: str(c.address_line_1),
      address_line_2: str(c.address_line_2),
      city: str(c.city),
      state: str(c.state),
      postal_code: str(c.postal_code),
      country: str(c.country),
      phone: str(c.phone),
      contact_person: str(c.contact_person),
      email: str(c.email),
    },
    notify_party: {
      company_name: str(n.company_name),
      address: str(n.address),
      city: str(n.city),
      country: str(n.country),
      phone: str(n.phone),
      email: str(n.email),
      contact_person: str(n.contact_person),
    },
    airline_information: {
      airline_name: str(a.airline_name),
      mawb_number: str(a.mawb_number),
      freight_payment: str(a.freight_payment) || "PP",
      iata_agent_code: str(a.iata_agent_code),
      account_number: str(a.account_number),
    },
    routing_information: {
      airport_of_departure: str(r.airport_of_departure),
      departure_airport_code: str(r.departure_airport_code),
      airport_of_destination: str(r.airport_of_destination),
      destination_airport_code: str(r.destination_airport_code),
      first_carrier: str(r.first_carrier),
      routing: arr(r.routing).map((leg) => ({
        from: str(leg.from),
        to: str(leg.to),
        carrier: str(leg.carrier),
      })),
      flight_number: str(r.flight_number),
      flight_date: str(r.flight_date),
    },
    valuation_information: {
      currency: str(val.currency) || "INR",
      charges_code: str(val.charges_code),
      declared_value_for_carriage: str(val.declared_value_for_carriage),
      declared_value_for_customs: str(val.declared_value_for_customs),
      insurance_amount: str(val.insurance_amount),
      insurance_currency: str(val.insurance_currency),
    },
    shipment_details: {
      hawb_numbers: arr(sd.hawb_numbers).map(str).filter(Boolean),
      total_packages: num(sd.total_packages),
      gross_weight: num(sd.gross_weight),
      chargeable_weight: num(sd.chargeable_weight),
      commodity_item_number: str(sd.commodity_item_number),
      rate_per_kg: num(sd.rate_per_kg),
      total_freight_charge: num(sd.total_freight_charge),
      nature_of_goods: str(sd.nature_of_goods),
      dimensions: arr(sd.dimensions).map((d) => ({
        length_cm: num(d.length_cm),
        width_cm: num(d.width_cm),
        height_cm: num(d.height_cm),
        pieces: num(d.pieces),
      })),
      volume_cbm: num(sd.volume_cbm),
    },
    charges: {
      prepaid_collect: str(ch.prepaid_collect) || "PREPAID",
      valuation_charge: num(ch.valuation_charge),
      tax: num(ch.tax),
      other_charges_due_agent: num(ch.other_charges_due_agent),
      other_charges_due_carrier: num(ch.other_charges_due_carrier),
      total_prepaid: num(ch.total_prepaid),
      total_collect: num(ch.total_collect),
      currency_conversion_rate: num(ch.currency_conversion_rate),
      collect_charges_destination_currency: num(
        ch.collect_charges_destination_currency
      ),
    },
    shipper_declaration: {
      place: str(dec.place),
      execution_date: str(dec.execution_date),
      authorized_signatory: str(dec.authorized_signatory),
      signature: str(dec.signature),
    },
    status: body.status === "submitted" ? "submitted" : "draft",
    createdBy: str(body.createdBy) || str(user.fullName) || str(user.username),
    createdByRole: str(body.createdByRole) || str(user.role),
    createdByLocation: str(body.createdByLocation) || str(user.location),
  };
};

// Flattened, fully-mapped document model for preview / client rendering.
const buildDocumentModel = (doc) => {
  const o = doc && typeof doc.toObject === "function" ? doc.toObject() : doc || {};
  return {
    id: o._id,
    title: "AWB INSTRUCTION",
    company: {
      name: "OM TRANS LOGISTICS LTD",
      address:
        "159, TRANSPORT CENTRE, PUNJABI BAGH, (NEAR PUNJABI BAGH FLY OVER) NEW DELHI-110035",
      phone: "011-28316541,42,43",
      fax: "011-28316548",
    },
    ...o,
  };
};

const esc = (v) =>
  String(v === undefined || v === null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Render a Word-compatible HTML representation of the AWB Instruction.
const renderMawbHtml = (doc) => {
  const m = buildDocumentModel(doc);
  const s = m.shipper || {};
  const c = m.consignee || {};
  const n = m.notify_party || {};
  const a = m.airline_information || {};
  const r = m.routing_information || {};
  const v = m.valuation_information || {};
  const sd = m.shipment_details || {};
  const ch = m.charges || {};
  const dec = m.shipper_declaration || {};

  const addr = (p) =>
    [p.address_line_1, p.address_line_2, [p.city, p.state, p.postal_code].filter(Boolean).join(", "), p.country]
      .filter(Boolean)
      .map(esc)
      .join("<br>");

  const cell = "border:1px solid #000;padding:6px;font-size:12px;vertical-align:top;";
  const label = `${cell}background:#f0f0f0;font-weight:bold;width:160px;`;

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>AWB Instruction ${esc(a.mawb_number)}</title></head>
<body style="font-family:Arial,sans-serif;">
  <h2 style="text-align:center;margin:0 0 4px;">AWB INSTRUCTION</h2>
  <p style="text-align:center;margin:0 0 12px;font-size:12px;">
    <strong>${esc(m.company.name)}</strong><br>${esc(m.company.address)}<br>
    PH: ${esc(m.company.phone)} &nbsp; FAX: ${esc(m.company.fax)}
  </p>
  <table style="border-collapse:collapse;width:100%;margin-bottom:10px;">
    <tr><td style="${label}">SHIPPER</td><td style="${cell}"><strong>${esc(s.company_name)}</strong><br>${addr(s)}<br>${esc(s.contact_person)} ${s.phone ? "| " + esc(s.phone) : ""} ${s.email ? "| " + esc(s.email) : ""}</td></tr>
    <tr><td style="${label}">CONSIGNEE</td><td style="${cell}"><strong>${esc(c.company_name)}</strong><br>${addr(c)}<br>${esc(c.contact_person)} ${c.phone ? "| " + esc(c.phone) : ""} ${c.email ? "| " + esc(c.email) : ""}</td></tr>
    <tr><td style="${label}">NOTIFY</td><td style="${cell}"><strong>${esc(n.company_name)}</strong><br>${esc(n.address)}<br>${[n.city, n.country].filter(Boolean).map(esc).join(", ")} ${n.phone ? "| " + esc(n.phone) : ""}</td></tr>
  </table>
  <table style="border-collapse:collapse;width:100%;margin-bottom:10px;">
    <tr><td style="${label}">Airline</td><td style="${cell}">${esc(a.airline_name)}</td><td style="${label}">Freight</td><td style="${cell}">${esc(a.freight_payment)}</td></tr>
    <tr><td style="${label}">MAWB No</td><td style="${cell}">${esc(a.mawb_number)}</td><td style="${label}">HAWB Nos</td><td style="${cell}">${(sd.hawb_numbers || []).map(esc).join(", ")}</td></tr>
    <tr><td style="${label}">IATA Code</td><td style="${cell}">${esc(a.iata_agent_code)}</td><td style="${label}">Account No</td><td style="${cell}">${esc(a.account_number)}</td></tr>
  </table>
  <table style="border-collapse:collapse;width:100%;margin-bottom:10px;">
    <tr><td style="${label}">Airport of Departure</td><td style="${cell}">${esc(r.airport_of_departure)} ${r.departure_airport_code ? "(" + esc(r.departure_airport_code) + ")" : ""}</td><td style="${label}">Airport of Destination</td><td style="${cell}">${esc(r.airport_of_destination)} ${r.destination_airport_code ? "(" + esc(r.destination_airport_code) + ")" : ""}</td></tr>
    <tr><td style="${label}">First Carrier</td><td style="${cell}">${esc(r.first_carrier)}</td><td style="${label}">Flight / Date</td><td style="${cell}">${esc(r.flight_number)} ${r.flight_date ? "/ " + esc(r.flight_date) : ""}</td></tr>
    <tr><td style="${label}">Currency</td><td style="${cell}">${esc(v.currency)}</td><td style="${label}">Chgs Code</td><td style="${cell}">${esc(v.charges_code)}</td></tr>
    <tr><td style="${label}">Declared Value (Carriage)</td><td style="${cell}">${esc(v.declared_value_for_carriage)}</td><td style="${label}">Declared Value (Customs)</td><td style="${cell}">${esc(v.declared_value_for_customs)}</td></tr>
    <tr><td style="${label}">Amount of Insurance</td><td style="${cell}">${esc(v.insurance_amount)} ${esc(v.insurance_currency)}</td><td style="${label}">Volume (CBM)</td><td style="${cell}">${esc(sd.volume_cbm)}</td></tr>
  </table>
  <table style="border-collapse:collapse;width:100%;margin-bottom:10px;">
    <tr>
      <td style="${label}">No. of Pcs</td><td style="${cell}">${esc(sd.total_packages)}</td>
      <td style="${label}">Gross Weight</td><td style="${cell}">${esc(sd.gross_weight)}</td>
      <td style="${label}">Chargeable Weight</td><td style="${cell}">${esc(sd.chargeable_weight)}</td>
    </tr>
    <tr>
      <td style="${label}">Commd. Item No.</td><td style="${cell}">${esc(sd.commodity_item_number)}</td>
      <td style="${label}">Rate / Charge</td><td style="${cell}">${esc(sd.rate_per_kg)}</td>
      <td style="${label}">Total</td><td style="${cell}">${esc(sd.total_freight_charge)}</td>
    </tr>
    <tr><td style="${label}">Nature &amp; Qty of Goods</td><td style="${cell}" colspan="5">${esc(sd.nature_of_goods)}</td></tr>
  </table>
  <table style="border-collapse:collapse;width:100%;margin-bottom:10px;">
    <tr><td style="${label}">Prepaid / Collect</td><td style="${cell}">${esc(ch.prepaid_collect)}</td><td style="${label}">Valuation Charge</td><td style="${cell}">${esc(ch.valuation_charge)}</td></tr>
    <tr><td style="${label}">Tax</td><td style="${cell}">${esc(ch.tax)}</td><td style="${label}">Total Other Chgs (Agent)</td><td style="${cell}">${esc(ch.other_charges_due_agent)}</td></tr>
    <tr><td style="${label}">Total Other Chgs (Carrier)</td><td style="${cell}">${esc(ch.other_charges_due_carrier)}</td><td style="${label}">Total Prepaid</td><td style="${cell}">${esc(ch.total_prepaid)}</td></tr>
    <tr><td style="${label}">Total Collect</td><td style="${cell}">${esc(ch.total_collect)}</td><td style="${label}">Currency Conv. Rate</td><td style="${cell}">${esc(ch.currency_conversion_rate)}</td></tr>
    <tr><td style="${label}">Coll. Chgs. in Dest. Currency</td><td style="${cell}" colspan="3">${esc(ch.collect_charges_destination_currency)}</td></tr>
  </table>
  <p style="font-size:12px;margin-top:18px;">
    Executed on (Date): ${esc(dec.execution_date)} &nbsp;&nbsp; Place: ${esc(dec.place)}<br><br>
    <strong>OMTRANS LOGISTICS LTD</strong><br>
    Signature of Shipper or his Agent: ${esc(dec.authorized_signatory)}
  </p>
</body></html>`;
};

module.exports = { sanitizeMawbPayload, buildDocumentModel, renderMawbHtml };
