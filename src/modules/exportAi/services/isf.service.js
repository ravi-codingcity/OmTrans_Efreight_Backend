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
const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().toUpperCase();

// Split a Booking-Confirmation ETD/ETA value that carries "PORT, COUNTRY, DD/MM/YYYY"
// (or any order) into its location and date parts.
const splitLocDate = (raw) => {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { loc: "", date: "" };
  const dm = s.match(/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/);
  const date = dm ? dm[0] : "";
  let loc = date ? s.slice(0, dm.index) + s.slice(dm.index + date.length) : s;
  loc = loc.replace(/[–—-]/g, " ").replace(/^[\s,]+|[\s,]+$/g, "").replace(/\s{2,}/g, " ").trim();
  return { loc, date };
};
// Combine a location and a date into "LOCATION – DATE" (falling back to whichever
// part is present, or the caller's fallback when both are empty).
const combineLocDate = (loc, date, fallback) => {
  const l = String(loc || "").trim();
  const d = String(date || "").trim();
  if (l && d) return `${l} – ${d}`;
  return d || l || String(fallback || "").trim();
};

function buildIsfFromShipment(hblData = {}, mblData = null, documents = [], options = {}) {
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

  // ETD / ETA. For the consolidated (Multiple LEO → Single HBL) workflow the ISF shows
  // BOTH the location and the date ("NHAVA SHEVA, INDIA – 2026-07-20"): the location is
  // taken from the Booking Confirmation's ETD/ETA value (or Port of Loading/Discharge
  // as a fallback) and combined with the date. Other workflows keep the existing value.
  let vesselEtd, vesselEta;
  if (options.consolidated) {
    const etdRaw = hblData.vesselEtd || bookingField("vessel_etd");
    const etaRaw = hblData.vesselEta || bookingField("vessel_eta");
    const etd = splitLocDate(etdRaw);
    const eta = splitLocDate(etaRaw);
    vesselEtd = combineLocDate(etd.loc || bookingField("port_of_loading") || pol, etd.date, etdRaw || pol);
    vesselEta = combineLocDate(eta.loc || bookingField("port_of_discharge") || pod, eta.date, etaRaw || pod);
  } else {
    vesselEtd = hblData.vesselEtd || bookingField("vessel_etd") || pol;
    vesselEta = hblData.vesselEta || bookingField("vessel_eta") || pod;
  }

  // Manufacturer / Seller / Container Stuffing Location default to the Shipper. In the
  // consolidated workflow, where they are identical, avoid printing the same address
  // three times — the Manufacturer keeps the full address and the others reference it.
  // Genuinely different values are preserved as-is.
  let seller = shipper;
  let stuffingLocation = shipper;
  if (options.consolidated) {
    if (norm(seller) === norm(shipper)) seller = "SAME AS MANUFACTURER / SUPPLIER";
    if (norm(stuffingLocation) === norm(shipper)) stuffingLocation = "SAME AS MANUFACTURER / SUPPLIER";
  }

  return {
    manufacturer: shipper,
    seller,
    stuffingLocation,
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
