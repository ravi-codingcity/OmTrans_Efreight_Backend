/**
 * Build the default ISF data from the finalized HBL/MBL records plus the Booking
 * Confirmation document (no AI re-analysis). Four fields are fixed constants; the
 * rest map from the saved shipment data. Everything is editable afterwards.
 */
const CONSOLIDATOR = "OM TRANS LOGISTICS LTD\n159 TRANSPORT CENTRE\nNEAR PUNJABI BAGH FLYOVER\nNEW DELHI – 110035\nINDIA";
const COUNTRY_OF_ORIGIN = "INDIA";
const SCAC_CODE = "OLLI";
const AMS_NO = "146616001586";

const isBookingDoc = (d) => d.detectedType === "booking_confirmation" || /booking/i.test(d.originalName || "");

function buildIsfFromShipment(hblData = {}, mblData = null, documents = []) {
  const summary = (label) => {
    const f = (hblData.summary || []).find((s) => s.label === label);
    return (f && f.value) || "";
  };
  const descLine = (id) => {
    const l = ((hblData.cargo && hblData.cargo.descLines) || []).find((x) => x.id === id);
    return (l && l.value) || "";
  };

  const shipper = summary("Shipper / Exporter");
  const consignee = summary("Consignee");

  const containers = (hblData.cargo && hblData.cargo.containers) || [];
  const nums = containers.map((c) => String(c.containerSeal || "").split(/\s*\/\s*Seal/i)[0].trim()).filter(Boolean);
  const containerType = descLine("containerType");
  const typeShort = containerType ? containerType.split(/[×x]/i)[0].trim() : "";
  const containerNo = nums.length ? `${nums.join("; ")}${typeShort ? ` /${typeShort}` : ""}` : containerType;

  const bookingDocs = (documents || []).filter(isBookingDoc);
  const bookingField = (key) => { for (const d of bookingDocs) { const v = d.extractedFields && d.extractedFields[key]; if (v) return String(v); } return ""; };
  let commodity = "";
  for (const d of bookingDocs) {
    const items = ((d.rawExtraction && d.rawExtraction.lineItems) || []).map((x) => x.description).filter(Boolean);
    if (items.length) { commodity = [...new Set(items.map((s) => s.trim()))].join(", "); break; }
    if (d.extractedFields && d.extractedFields.description_of_goods) { commodity = String(d.extractedFields.description_of_goods); break; }
  }
  if (!commodity) commodity = descLine("goods");

  const pol = summary("Port of Loading (POL)");
  const pod = summary("Port of Discharge (POD)");
  const vesselEtd = hblData.vesselEtd || bookingField("vessel_etd") || pol;
  const vesselEta = hblData.vesselEta || bookingField("vessel_eta") || pod;

  return {
    manufacturer: shipper,
    seller: shipper,
    stuffingLocation: shipper,
    buyer: consignee,
    shipTo: consignee,
    invoiceNumber: descLine("invoiceNo"),
    invoiceDate: descLine("invoiceDate"),
    consolidator: CONSOLIDATOR,
    countryOfOrigin: COUNTRY_OF_ORIGIN,
    scacCode: SCAC_CODE,
    amsNo: AMS_NO,
    htsNumber: descLine("hsn"),
    vesselVoyage: summary("Ocean Vessel / Voyage No. / Flag"),
    hblNo: hblData.hblNumber || "",
    mblNo: (mblData && mblData.mblNumber) || hblData.bookingNumber || "",
    vesselEtd,
    vesselEta,
    containerNo,
    commodityDescription: commodity,
  };
}

module.exports = { buildIsfFromShipment };
