const fs = require("node:fs");
const PDFDocument = require("pdfkit");

/* Pure-JS PDF fallback (pdfkit) used when the LibreOffice/Word DOCX→PDF converter
   is unavailable. Renders the SAME structured data as a clean A4 document so PDF
   download always works. Install LibreOffice for a pixel-exact template match. */
const BRAND = "#1f3a5f";
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "" || String(v).trim() === "Not Found";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`; };

function sectionTitle(doc, text) {
  if (doc.y > doc.page.height - 90) doc.addPage();
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor(BRAND).font("Helvetica-Bold").text(text);
  doc.moveDown(0.2);
  doc.fillColor("#000").font("Helvetica");
}

function detailsGrid(doc, fields) {
  const x0 = doc.page.margins.left;
  const cw = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gap = 10;
  const colW = (cw - gap) / 2;
  const pad = 4;
  const cellH = (f, w) => { doc.font("Helvetica-Bold").fontSize(9); return doc.heightOfString(`${f.label}: ${f.value}`, { width: w - pad * 2 }) + pad * 2; };
  const draw = (f, x, y, w, h) => {
    doc.rect(x, y, w, h).strokeColor("#d5d5d5").lineWidth(0.5).stroke();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#333").text(`${f.label}: `, x + pad, y + pad, { width: w - pad * 2, continued: true });
    doc.font("Helvetica").fontSize(9).fillColor("#111").text(String(f.value || ""));
  };
  const ensure = (h) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.wide) { const h = cellH(f, cw); ensure(h); draw(f, x0, doc.y, cw, h); doc.y += h; i += 1; }
    else {
      const f2 = i + 1 < fields.length && !fields[i + 1].wide ? fields[i + 1] : null;
      const h = Math.max(cellH(f, f2 ? colW : cw), f2 ? cellH(f2, colW) : 0);
      ensure(h);
      const y = doc.y;
      draw(f, x0, y, f2 ? colW : cw, h);
      if (f2) draw(f2, x0 + colW + gap, y, colW, h);
      doc.y = y + h; i += f2 ? 2 : 1;
    }
  }
}

function drawTable(doc, columns, rows) {
  const x0 = doc.page.margins.left;
  const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const wsum = columns.reduce((a, c) => a + (c.width || 1), 0);
  const colW = columns.map((c) => ((c.width || 1) / wsum) * totalWidth);
  const pad = 4;
  const rowHeight = (cells) => Math.max(16, ...cells.map((t, i) => doc.heightOfString(String(t == null ? "" : t), { width: colW[i] - pad * 2 }) + pad * 2));
  const drawRow = (cells, { bold = false, fill = null } = {}) => {
    const h = rowHeight(cells);
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
    let x = x0; const y = doc.y;
    columns.forEach((_, i) => {
      if (fill) doc.rect(x, y, colW[i], h).fill(fill);
      doc.rect(x, y, colW[i], h).strokeColor("#999").lineWidth(0.5).stroke();
      doc.fillColor("#000").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 8 : 9).text(String(cells[i] == null ? "" : cells[i]), x + pad, y + pad, { width: colW[i] - pad * 2 });
      x += colW[i];
    });
    doc.y = y + h;
  };
  drawRow(columns.map((c) => c.header), { bold: true, fill: "#eef2f8" });
  if (!rows.length) drawRow(columns.map(() => "—"));
  else rows.forEach((r) => drawRow(columns.map((c) => r[c.key])));
}

const BLANK = "______________________";
const renderDescLine = (l) => {
  if (typeof l === "string") return l;
  const v = isEmpty(l.value) ? (l.blank ? BLANK : "") : l.value;
  return l.label ? `${l.label}: ${v}` : v;
};

function renderShipmentPdf(pdfPath, data = {}, opts = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const stream = fs.createWriteStream(pdfPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(16).fillColor(BRAND).font("Helvetica-Bold").text(opts.title || "BILL OF LADING", { align: "center" });
    const headerBits = [
      opts.numberLabel && data[opts.numberKey] ? `${opts.numberLabel}: ${data[opts.numberKey]}` : "",
      !isEmpty(data.bookingNumber) ? `Booking No.: ${data.bookingNumber}` : "",
      `Date: ${data.date || today()}`,
    ].filter(Boolean).join("     ");
    doc.moveDown(0.3).fontSize(9).fillColor("#555").font("Helvetica").text(headerBits, { align: "center" });
    doc.fillColor("#000");

    const summary = (data.summary || []).filter((s) => !isEmpty(s.value)).map((s) => ({ label: s.label, value: s.value, wide: !!s.wide || /shipper|consignee|notify/i.test(s.label) }));
    if (summary.length) { sectionTitle(doc, "Shipment Details"); detailsGrid(doc, summary); }

    const containers = (data.cargo && data.cargo.containers) || [];
    if (containers.length) {
      sectionTitle(doc, "Container-Wise Details");
      const cols = [
        { header: "Container No. / Seal No.", key: "containerSeal", width: 2.4 },
        { header: "Qty (PKG)", key: "quantity", width: 1 },
        { header: "Gross Wt (G. WT)", key: "grossWeight", width: 1.2 },
        { header: "CBM", key: "cbm", width: 0.8 },
      ];
      const rows = containers.map((c) => ({ ...c }));
      if (data.cargo && data.cargo.totals) rows.push({ containerSeal: "TOTAL", quantity: data.cargo.totals.quantity, grossWeight: data.cargo.totals.grossWeight, cbm: "" });
      drawTable(doc, cols, rows);
    }

    const lines = ((data.cargo && data.cargo.descLines) || []).map(renderDescLine).filter((s) => s !== "");
    if (lines.length) {
      sectionTitle(doc, "Description of Goods");
      doc.fontSize(9).font("Helvetica").fillColor("#111");
      lines.forEach((ln) => doc.text(ln, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }));
    }
    doc.end();
  });
}

const ISF_ROWS = [
  ["1", "Manufacturer/Supplier", "manufacturer"],
  ["2", "Seller", "seller"],
  ["3", "Buyer (Importer of Record) and ID Number", "buyer"],
  ["4", "Ship To", "shipTo"],
  ["5", "Invoice Number", "invoiceNumber"],
  ["6", "Invoice Date", "invoiceDate"],
  ["7", "Container Stuffing Location", "stuffingLocation"],
  ["8", "Consolidator (Stuffer)/Export Forwarder", "consolidator"],
  ["9", "Country of Origin", "countryOfOrigin"],
  ["10", "HTN (Harmonized Tariff Number)", "htsNumber"],
  ["11", "Vessel Name and Voyage Number", "vesselVoyage"],
  ["12", "MBL No. / HBL No. / SCAC Code / AMS No.", "__refs__"],
  ["13", "Vessel ETD (Port of Loading)", "vesselEtd"],
  ["14", "Vessel ETA at US Port of Discharge", "vesselEta"],
  ["15", "Container No.", "containerNo"],
  ["16", "Commodity Description of Goods", "commodityDescription"],
];

function renderIsfPdf(pdfPath, isf = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const stream = fs.createWriteStream(pdfPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(15).fillColor(BRAND).font("Helvetica-Bold").text("Importer Security Filing (ISF) — 10+2", { align: "center" });
    doc.moveDown(0.6).fillColor("#000");

    const refVal = [isf.mblNo, isf.hblNo, isf.scacCode, isf.amsNo].filter((v) => !isEmpty(v)).join("\n");
    const rows = ISF_ROWS.map(([sno, label, key]) => ({ sno, label, value: key === "__refs__" ? refVal : (isf[key] || "") }));
    drawTable(doc, [
      { header: "S.No.", key: "sno", width: 0.5 },
      { header: "Field", key: "label", width: 2.2 },
      { header: "Value", key: "value", width: 3.3 },
    ], rows);
    doc.end();
  });
}

module.exports = { renderShipmentPdf, renderIsfPdf };
