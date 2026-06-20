const { SHIPMENT_REPORT_TEMPLATE } = require("../config/templates");
const { isPriorityDoc } = require("./comparison.service");

/* ------------------------------------------------------------------ */
/*  Full shipment-report data builder (ported faithfully).            */
/*  Produces the editable HBL preview structure consumed by the HBL/  */
/*  MBL/ISF renderers: summary[], cargo{columns,containers,descLines, */
/*  totals,isMulti}, vesselEtd/Eta, sealRule, weightCheck.            */
/* ------------------------------------------------------------------ */
const NOT_FOUND = "Not Found";
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "";
const normKey = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const cleanSeal = (s) =>
  String(s || "")
    .replace(/^\s*(line\s*seal\s*no\.?|shipping\s*line\s*seal\s*no\.?|carrier\s*seal\s*no\.?|customs?\s*seal\s*no\.?|cust\s*seal\s*no\.?|line\s*seal|shipping\s*line\s*seal|carrier\s*seal|customs?\s*seal|seal\s*no\.?|c\s*\/\s*s|seal)\s*[:.#-]*\s*/i, "")
    .trim();

function buildShipmentReportData(consolidated = {}, documents = [], options = {}) {
  const fields = consolidated.fields || {};
  const tmpl = SHIPMENT_REPORT_TEMPLATE;

  const sbDocs = documents.filter(isPriorityDoc);
  const goodsDocs = sbDocs.length ? sbDocs : documents;
  const bookingDocs = documents.filter((d) => d.detectedType === "booking_confirmation" || /booking/i.test(d.originalName || ""));
  const firstVal = (docs, key) => {
    for (const d of docs) { const v = d.extractedFields && d.extractedFields[key]; if (!isEmpty(v)) return String(v); }
    return "";
  };

  const fwdDocs = documents.filter((d) => d.detectedType === "forwarding_note" || /forwarding/i.test(d.originalName || ""));
  const egateDocs = documents.filter((d) =>
    d.detectedType === "form_10" || d.detectedType === "egate" ||
    /form[\s_-]*10|form10|e[\s-]?gate|sez[\s-]*4|form[\s_-]*13|form[\s_-]*6(?!\d)/i.test(d.originalName || "")
  );

  const isMumbai = String(options.location || "").trim().toLowerCase() === "mumbai";
  const extraSealDocs = isMumbai ? egateDocs : fwdDocs;
  const sealRule = isMumbai ? "Mumbai" : "Delhi";
  const sealDocs = [...sbDocs, ...extraSealDocs];

  const docRank = (d) => (isPriorityDoc(d) ? 0 : fwdDocs.includes(d) ? 1 : 2);
  const orderedDocs = [...documents].sort((a, b) => docRank(a) - docRank(b));
  const pushUnique = (arr, v) => { if (!isEmpty(v) && !arr.some((x) => normKey(x) === normKey(v))) arr.push(String(v).trim()); };

  const sbContainerNos = [];
  sbDocs.forEach((d) => ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => pushUnique(sbContainerNos, c.containerNo)));
  sbDocs.forEach((d) => pushUnique(sbContainerNos, d.extractedFields && d.extractedFields.container_number));
  let containerNos = sbContainerNos;
  if (!containerNos.length) {
    containerNos = [];
    orderedDocs.forEach((d) => ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => pushUnique(containerNos, c.containerNo)));
    if (!containerNos.length && !isEmpty(fields.container_number)) pushUnique(containerNos, fields.container_number);
  }

  const sealsByContainer = new Map();
  const addSealTo = (cNo, seal) => {
    const v = cleanSeal(seal);
    if (isEmpty(cNo) || isEmpty(v)) return;
    const k = normKey(cNo);
    if (!sealsByContainer.has(k)) sealsByContainer.set(k, []);
    const arr = sealsByContainer.get(k);
    if (!arr.some((s) => normKey(s) === normKey(v))) arr.push(v);
  };
  sealDocs.forEach((d) => ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => addSealTo(c.containerNo, c.sealNo)));

  const weightByContainer = new Map();
  const packagesByContainer = new Map();
  [...fwdDocs, ...orderedDocs].forEach((d) => ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => {
    if (isEmpty(c.containerNo)) return;
    const k = normKey(c.containerNo);
    if (!isEmpty(c.weight) && !weightByContainer.has(k)) weightByContainer.set(k, String(c.weight).trim());
    if (!isEmpty(c.packages) && !packagesByContainer.has(k)) packagesByContainer.set(k, String(c.packages).trim());
  }));

  const sealPool = [];
  sealDocs.forEach((d) => {
    ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => pushUnique(sealPool, cleanSeal(c.sealNo)));
    ((d.rawExtraction && d.rawExtraction.seals) || []).forEach((s) => pushUnique(sealPool, cleanSeal(s)));
    pushUnique(sealPool, cleanSeal(d.extractedFields && d.extractedFields.seal_number));
  });

  const containers = containerNos.map((no) => ({
    containerNo: no,
    seals: (sealsByContainer.get(normKey(no)) || []).slice(),
    weight: weightByContainer.get(normKey(no)) || "",
    packages: packagesByContainer.get(normKey(no)) || "",
  }));
  const usedSeals = new Set();
  containers.forEach((c) => c.seals.forEach((s) => usedSeals.add(normKey(s))));
  const orphanSeals = sealPool.filter((s) => !usedSeals.has(normKey(s)));
  if (orphanSeals.length) {
    if (containers.length) orphanSeals.forEach((s) => { containers[0].seals.push(s); usedSeals.add(normKey(s)); });
    else containers.push({ containerNo: "", seals: orphanSeals });
  }

  const prodMap = new Map();
  goodsDocs.forEach((doc) => {
    ((doc.rawExtraction && doc.rawExtraction.lineItems) || []).forEach((li) => {
      if (isEmpty(li.description)) return;
      const key = String(li.description).trim().toLowerCase();
      if (!prodMap.has(key)) prodMap.set(key, { description: String(li.description).trim(), hsCode: li.hsCode ? String(li.hsCode).trim() : "" });
      else if (isEmpty(prodMap.get(key).hsCode) && li.hsCode) prodMap.get(key).hsCode = String(li.hsCode).trim();
    });
  });
  const products = [...prodMap.values()];

  const goodsHs = new Map();
  goodsDocs.forEach((doc) => {
    ((doc.rawExtraction && doc.rawExtraction.hsCodes) || []).forEach((c) => { if (!isEmpty(c)) goodsHs.set(normKey(c), String(c).trim()); });
    if (!isEmpty(doc.extractedFields && doc.extractedFields.hs_code)) goodsHs.set(normKey(doc.extractedFields.hs_code), String(doc.extractedFields.hs_code).trim());
  });

  let goodsDescs = products.map((p) => p.description).filter((v) => !isEmpty(v));
  if (!goodsDescs.length && !isEmpty(fields.description_of_goods)) goodsDescs = [String(fields.description_of_goods)];
  const uniqueHs = [...goodsHs.values()];

  const bookingSize = firstVal(bookingDocs, "container_size") || (bookingDocs.flatMap((d) => (d.rawExtraction && d.rawExtraction.containers) || []).find((c) => !isEmpty(c.size)) || {}).size || "";
  const sbCount = firstVal(sbDocs, "number_of_containers") || (containers.length ? String(containers.length) : "");
  let containerTypeCount = "";
  if (!isEmpty(bookingSize) && !isEmpty(sbCount)) containerTypeCount = `${bookingSize} × ${sbCount}`;
  else if (!isEmpty(bookingSize)) containerTypeCount = bookingSize;
  else if (!isEmpty(sbCount)) containerTypeCount = `${sbCount} Container(s)`;

  const sbField = (key) => firstVal(sbDocs, key) || (isEmpty(fields[key]) ? "" : String(fields[key]));
  const invNo = sbField("invoice_number");
  const invDate = sbField("invoice_date");
  const sbNo = sbField("shipping_bill_number");
  const sbDate = sbField("shipping_bill_date");
  const iec = sbField("iec_number");

  const BLANK_LINE = "______________________";
  const descLines = [];
  const addLine = (id, label, value, opts = {}) => {
    if (opts.always || !isEmpty(value)) descLines.push({ id, label, value: isEmpty(value) ? "" : String(value), blank: !!opts.blank });
  };
  addLine("containerType", "", containerTypeCount);
  addLine("goods", "", goodsDescs.join("\n"));
  if (uniqueHs.length) addLine("hsn", "HSN Code", uniqueHs.join(", "));
  addLine("invoiceNo", "Invoice No.", invNo);
  addLine("invoiceDate", "Invoice Date", invDate);
  addLine("sbNo", "Shipping Bill No.", sbNo);
  addLine("sbDate", "Shipping Bill Date", sbDate);
  addLine("iec", "IEC / BR Number", iec);
  addLine("netWt", "Net WT", "", { always: true, blank: true });
  addLine("freight", "FREIGHT", "", { always: true, blank: true });
  const renderDescLine = (l) => {
    const v = isEmpty(l.value) ? (l.blank ? BLANK_LINE : "") : l.value;
    return l.label ? `${l.label}: ${v}` : v;
  };
  const descriptionText = descLines.length ? descLines.map(renderDescLine).filter((s) => s !== "").join("\n") : NOT_FOUND;

  const cargoCols = [
    { header: "Container Number / Seal Number", key: "containerSeal" },
    { header: "Quantity (PKG)", key: "quantity" },
    { header: "Description of Goods", key: "description" },
    { header: "Gross Weight (G. WT)", key: "grossWeight" },
  ];
  const qty = firstVal(sbDocs, "number_of_packages") || (isEmpty(fields.number_of_packages) ? "" : String(fields.number_of_packages));
  const gw = firstVal(sbDocs, "total_gross_weight") || (isEmpty(fields.total_gross_weight) ? "" : String(fields.total_gross_weight));

  const realContainers = containers.filter((c) => !isEmpty(c.containerNo));
  const isMulti = realContainers.length > 1;

  const containerEntries = containers
    .map((c) => {
      const sealPart = c.seals.length ? c.seals.map((s) => `Seal No. ${s}`).join(", ") : "";
      const containerSeal = isEmpty(c.containerNo) ? sealPart : sealPart ? `${c.containerNo} / ${sealPart}` : c.containerNo;
      return {
        containerSeal,
        quantity: isMulti ? (isEmpty(c.packages) ? "" : String(c.packages)) : qty,
        grossWeight: isMulti ? (isEmpty(c.weight) ? "" : String(c.weight)) : gw,
        cbm: "",
      };
    })
    .filter((e) => !isEmpty(e.containerSeal));
  if (!containerEntries.length) containerEntries.push({ containerSeal: "", quantity: qty, grossWeight: gw, cbm: "" });

  const totals = isMulti ? { quantity: qty, grossWeight: gw } : null;

  const toKg = (s) => {
    const m = String(s || "").replace(/,/g, "").match(/([\d.]+)\s*(MT|KGS?|TONS?|T)?/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    if (Number.isNaN(v)) return null;
    const u = (m[2] || "").toUpperCase();
    return u.startsWith("MT") || u === "T" || u.startsWith("TON") ? v * 1000 : v;
  };
  const toNum = (s) => { const m = String(s || "").replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  let weightCheck = null;
  if (isMulti) {
    const perKg = realContainers.map((c) => toKg(c.weight)).filter((n) => n != null);
    const haveAllW = perKg.length === realContainers.length;
    const sumKg = perKg.reduce((a, b) => a + b, 0);
    const sbKg = toKg(gw);
    const wTol = sbKg != null ? Math.max(50, sbKg * 0.01) : 50;
    const perPkg = realContainers.map((c) => toNum(c.packages)).filter((n) => n != null);
    const haveAllP = perPkg.length === realContainers.length;
    const sumPkg = perPkg.reduce((a, b) => a + b, 0);
    const sbPkg = toNum(qty);
    weightCheck = {
      isMulti: true,
      containers: realContainers.map((c) => ({ containerNo: c.containerNo, weight: isEmpty(c.weight) ? "Not Found" : c.weight, packages: isEmpty(c.packages) ? "Not Found" : c.packages })),
      shippingBillTotal: isEmpty(gw) ? "Not Found" : String(gw),
      shippingBillQty: isEmpty(qty) ? "Not Found" : String(qty),
      missingWeights: realContainers.filter((c) => isEmpty(c.weight)).map((c) => c.containerNo),
      missingPackages: realContainers.filter((c) => isEmpty(c.packages)).map((c) => c.containerNo),
      mismatch: haveAllW && sbKg != null && Math.abs(sumKg - sbKg) > wTol,
      qtyMismatch: haveAllP && sbPkg != null && Math.abs(sumPkg - sbPkg) > 0,
    };
  }

  const summary = tmpl.summaryFields.map((d) => {
    if (d.blank) return { label: d.label, value: "", blank: true, wide: !!d.wide };
    let value;
    if (d.composite) {
      const pick = d.source === "shipping_bill" ? (k) => firstVal(sbDocs, k) || fields[k] : (k) => fields[k];
      let parts = d.composite.map(pick).filter((v) => !isEmpty(v)).map(String);
      parts = parts.filter((p, i) => !parts.some((o, j) => j !== i && o.toLowerCase().includes(p.toLowerCase())));
      value = parts.join(d.joiner || " / ");
    } else if (d.pairKeys) {
      const [a, b] = d.pairKeys.map((k) => (isEmpty(fields[k]) ? NOT_FOUND : String(fields[k])));
      const found = !(a === NOT_FOUND && b === NOT_FOUND);
      return { label: d.label, value: `${a}  |  ${b}`, found, wide: !!d.wide };
    } else if (d.source === "booking") {
      value = firstVal(bookingDocs, d.key) || fields[d.key];
    } else if (d.source === "booking_only") {
      value = d.key === "container_size" ? bookingSize : firstVal(bookingDocs, d.key);
    } else {
      value = fields[d.key];
    }
    if (isEmpty(value)) return { label: d.label, value: NOT_FOUND, found: false, wide: !!d.wide };
    return { label: d.label, value: String(value), found: true, wide: !!d.wide };
  });

  const vesselEtd = firstVal(bookingDocs, "vessel_etd");
  const vesselEta = firstVal(bookingDocs, "vessel_eta");

  return {
    documentTitle: tmpl.documentTitle,
    summary,
    cargo: { columns: cargoCols, containers: containerEntries, description: descriptionText, descLines, totals, isMulti },
    vesselEtd,
    vesselEta,
    sealRule,
    weightCheck,
  };
}

module.exports = { buildShipmentReportData };
