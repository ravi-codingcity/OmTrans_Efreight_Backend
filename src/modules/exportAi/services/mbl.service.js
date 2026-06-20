/**
 * Build the default MBL data from a finalized HBL record. The MBL format is nearly
 * identical to the HBL, so almost everything is copied verbatim — only the
 * Shipper/Consignee/Notify fields differ, plus the MBL Number (from the Booking No).
 */
const MBL_SHIPPER = "OmTrans Logistics Ltd, 159, Transport Center,Punjabi Bagh, New Delhi-110035, India";

const setSummary = (summary, label, value) => {
  const f = summary.find((s) => s.label === label);
  if (f) f.value = value;
  else summary.push({ label, value });
};

function buildMblFromHbl(hblData = {}) {
  const data = JSON.parse(JSON.stringify(hblData || {}));
  data.summary = data.summary || [];

  setSummary(data.summary, "Shipper / Exporter", MBL_SHIPPER);
  setSummary(data.summary, "Consignee", "");
  setSummary(data.summary, "Notify Party", "");

  data.mblNumber = hblData.bookingNumber || "";
  delete data.hblNumber;
  delete data.bookingNumber;
  return data;
}

module.exports = { buildMblFromHbl };
