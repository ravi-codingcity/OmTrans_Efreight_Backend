const { SHIPMENT_REPORT_TEMPLATE } = require("../config/templates");
const { isPriorityDoc, isShippingInstruction } = require("./comparison.service");

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
    .replace(/^\s*(line\s*seal\s*no\.?|shipping\s*line\s*seal\s*no\.?|carrier\s*seal\s*no\.?|agent\s*seal\s*no\.?|customs?\s*seal\s*no\.?|cust\s*seal\s*no\.?|line\s*seal|shipping\s*line\s*seal|carrier\s*seal|agent\s*seal|customs?\s*seal|seal\s*no\.?|c\s*\/\s*s|seal)\s*[:.#-]*\s*/i, "")
    .trim();

function buildShipmentReportData(consolidated = {}, documents = [], options = {}) {
  const fields = consolidated.fields || {};
  const tmpl = SHIPMENT_REPORT_TEMPLATE;

  // Shipping Instruction / Bill of Lading Instructions — highest-priority source for
  // Shipper/Consignee/Notify, Container & Seal numbers, Freight term and Net Weight.
  const siDocs = documents.filter(isShippingInstruction);
  // In Multiple-LEO mode the caller pins THIS shipment's LEO so all shipment-specific
  // data (exporter, goods, SB number/date, gross weight, quantity, container) comes
  // only from that document — never from another shipment's LEO or a shared doc that
  // happens to reference a shipping bill.
  const sbDocs = options.leoDoc ? [options.leoDoc] : documents.filter(isPriorityDoc);
  // Description of Goods (and its HSN codes) must ALWAYS come from the Shipping
  // Bill / LEO / Indian Customs EDI — never from the Shipping Instruction. Prefer
  // the Shipping Bill; otherwise any non-SI document; SI is always excluded here.
  const nonSiDocs = documents.filter((d) => !isShippingInstruction(d));
  const goodsDocs = sbDocs.length ? sbDocs : nonSiDocs;
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
  // CLP (Container Load Plan) — carries Agent Seal No. + Custom Seal No.
  const clpDocs = documents.filter((d) => d.detectedType === "clp" || /\bclp\b|container\s*load\s*plan/i.test(d.originalName || ""));

  const isMumbai = String(options.location || "").trim().toLowerCase() === "mumbai";
  const sealRule = isMumbai ? "Mumbai" : "Delhi";
  // Seal numbers are taken from whichever seal document the user uploaded — any of
  // Forwarding Note, Form 13 / E-Gate, or CLP. The location only sets which is
  // preferred first; all are accepted (auto-detected) and de-duplicated.
  //   Delhi : Shipping Instruction → LEO/Shipping Bill/EDI → Forwarding Note → E-Gate/Form 13 → CLP
  //   Mumbai: Shipping Instruction → LEO/Shipping Bill/EDI → E-Gate/Form 13 → Forwarding Note → CLP
  const extraSealDocs = isMumbai ? [...egateDocs, ...fwdDocs, ...clpDocs] : [...fwdDocs, ...egateDocs, ...clpDocs];
  const sealDocs = [...siDocs, ...sbDocs, ...extraSealDocs];

  const docRank = (d) => (isShippingInstruction(d) ? 0 : isPriorityDoc(d) ? 1 : (fwdDocs.includes(d) || egateDocs.includes(d) || clpDocs.includes(d)) ? 2 : 3);
  const orderedDocs = [...documents].sort((a, b) => docRank(a) - docRank(b));
  const pushUnique = (arr, v) => { if (!isEmpty(v) && !arr.some((x) => normKey(x) === normKey(v))) arr.push(String(v).trim()); };

  // Consolidated helpers (Multiple LEO → Single HBL): collect every UNIQUE value of a
  // field across the given docs, and sum numeric totals (e.g. packages / gross weight).
  const collectUnique = (docs, key) => {
    const out = [];
    docs.forEach((d) => pushUnique(out, d.extractedFields && d.extractedFields[key]));
    return out;
  };
  const sumWithUnit = (docs, key) => {
    let total = 0, unit = "", any = false;
    docs.forEach((d) => {
      const raw = d.extractedFields && d.extractedFields[key];
      if (isEmpty(raw)) return;
      const m = String(raw).replace(/,/g, "").match(/([\d.]+)\s*([A-Za-z.]+)?/);
      if (!m) return;
      const n = parseFloat(m[1]);
      if (Number.isNaN(n)) return;
      total += n; any = true;
      if (!unit && m[2]) unit = m[2];
    });
    if (!any) return "";
    const numStr = Number.isInteger(total) ? String(total) : String(Math.round(total * 1000) / 1000);
    return unit ? `${numStr} ${unit}` : numStr;
  };

  // Container numbers: prefer the Shipping Instruction, then the Shipping Bill,
  // then any other document, then the consolidated field.
  const containersFromDocs = (docs) => {
    const nos = [];
    docs.forEach((d) => ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => pushUnique(nos, c.containerNo)));
    docs.forEach((d) => pushUnique(nos, d.extractedFields && d.extractedFields.container_number));
    return nos;
  };
  const siContainerNos = containersFromDocs(siDocs);
  const sbContainerNos = containersFromDocs(sbDocs);
  // A real Container Number follows ISO 6346: 4 letters + 6-7 digits (e.g.
  // MSCU1234567). This deliberately EXCLUDES the CIN Number (and other identifiers
  // on the LEO) which must never be used as the Container Number.
  const isContainerNo = (v) => /^[A-Z]{4}\d{6,7}$/.test(normKey(v));
  const validContainersFrom = (docs) => containersFromDocs(docs).filter(isContainerNo);
  // In Multiple-LEO (split) and consolidated modes, container numbers come from the
  // LEO/Shipping Bill(s) — never the shared Shipping Instruction. Only the plain
  // single-LEO workflow prefers the SI's container list.
  const preferSiContainers = !options.multiLeo && !options.consolidated && siContainerNos.length;
  let containerNos;
  if (options.consolidated) {
    // Consolidated MBL (Multiple LEO): take the Container Number from the LEO /
    // Shipping Bill / Indian Customs EDI first; if it is not available there, fall
    // back in order CLP → Forwarding Note → Form 13. Never use the CIN Number.
    containerNos = validContainersFrom(sbDocs);
    if (!containerNos.length) containerNos = validContainersFrom(clpDocs);
    if (!containerNos.length) containerNos = validContainersFrom(fwdDocs);
    if (!containerNos.length) containerNos = validContainersFrom(egateDocs);
    if (!containerNos.length) containerNos = validContainersFrom(orderedDocs);
  } else {
    containerNos = preferSiContainers ? siContainerNos : sbContainerNos;
    if (!containerNos.length) {
      containerNos = [];
      orderedDocs.forEach((d) => ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => pushUnique(containerNos, c.containerNo)));
      if (!containerNos.length && !isEmpty(fields.container_number)) pushUnique(containerNos, fields.container_number);
    }
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
  // Liner / Agent / Customs Seal No. are all captured per container row (Forwarding
  // Note, Form 13, CLP and SI each provide whichever variants apply).
  sealDocs.forEach((d) => ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => {
    addSealTo(c.containerNo, c.sealNo);
    addSealTo(c.containerNo, c.linerSeal);
    addSealTo(c.containerNo, c.agentSeal);
    addSealTo(c.containerNo, c.customsSeal);
  }));

  const weightByContainer = new Map();
  const packagesByContainer = new Map();
  [...fwdDocs, ...orderedDocs].forEach((d) => ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => {
    if (isEmpty(c.containerNo)) return;
    const k = normKey(c.containerNo);
    if (!isEmpty(c.weight) && !weightByContainer.has(k)) weightByContainer.set(k, String(c.weight).trim());
    if (!isEmpty(c.packages) && !packagesByContainer.has(k)) packagesByContainer.set(k, String(c.packages).trim());
  }));
  // Consolidated mode: attribute EACH LEO's own shipment-level Quantity (PKG) and
  // Gross Weight to its container so every LEO shows its individual values in the
  // combined cargo table. The container is the LEO's OWN valid container number when
  // present; otherwise the resolved container at the same position (containerNos[i]),
  // which handles the case where the real container comes from CLP / Forwarding / Form
  // 13 while the LEO only carried a CIN.
  if (options.consolidated) {
    sbDocs.forEach((d, i) => {
      const ef = d.extractedFields || {};
      const ownValid = [...(((d.rawExtraction && d.rawExtraction.containers) || []).map((c) => c.containerNo)), ef.container_number].filter(isContainerNo);
      const target = ownValid.length === 1 ? ownValid[0] : (ownValid.length === 0 ? containerNos[i] : null);
      if (isEmpty(target)) return;
      const k = normKey(target);
      if (!isEmpty(ef.number_of_packages) && !packagesByContainer.has(k)) packagesByContainer.set(k, String(ef.number_of_packages).trim());
      if (!isEmpty(ef.total_gross_weight) && !weightByContainer.has(k)) weightByContainer.set(k, String(ef.total_gross_weight).trim());
    });
  }

  const sealPool = [];
  sealDocs.forEach((d) => {
    ((d.rawExtraction && d.rawExtraction.containers) || []).forEach((c) => {
      pushUnique(sealPool, cleanSeal(c.sealNo));
      pushUnique(sealPool, cleanSeal(c.linerSeal));
      pushUnique(sealPool, cleanSeal(c.agentSeal));
      pushUnique(sealPool, cleanSeal(c.customsSeal));
    });
    ((d.rawExtraction && d.rawExtraction.seals) || []).forEach((s) => pushUnique(sealPool, cleanSeal(s)));
    pushUnique(sealPool, cleanSeal(d.extractedFields && d.extractedFields.seal_number));
    pushUnique(sealPool, cleanSeal(d.extractedFields && d.extractedFields.liner_seal_number));
    pushUnique(sealPool, cleanSeal(d.extractedFields && d.extractedFields.agent_seal_number));
    pushUnique(sealPool, cleanSeal(d.extractedFields && d.extractedFields.customs_seal_number));
  });

  const containers = containerNos.map((no) => ({
    containerNo: no,
    seals: (sealsByContainer.get(normKey(no)) || []).slice(),
    weight: weightByContainer.get(normKey(no)) || "",
    packages: packagesByContainer.get(normKey(no)) || "",
  }));
  const usedSeals = new Set();
  containers.forEach((c) => c.seals.forEach((s) => usedSeals.add(normKey(s))));
  // Pool any seals not already tied to a container — but NOT when the Shipping
  // Instruction supplied the containers/seals (its values are authoritative), and
  // NOT in multiple-LEO mode (a shared Forwarding Note / E-Gate lists every
  // shipment's seals, so unmatched ones belong to OTHER shipments — don't bleed
  // them onto this shipment's container).
  if (!siContainerNos.length && !options.multiLeo) {
    const orphanSeals = sealPool.filter((s) => !usedSeals.has(normKey(s)));
    if (orphanSeals.length) {
      if (containers.length) orphanSeals.forEach((s) => { containers[0].seals.push(s); usedSeals.add(normKey(s)); });
      else containers.push({ containerNo: "", seals: orphanSeals });
    }
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
  if (!goodsDescs.length) {
    // Fallback to the Shipping Bill / non-SI document field — not the SI document.
    const fb = firstVal(goodsDocs, "description_of_goods");
    if (!isEmpty(fb)) goodsDescs = [String(fb)];
  }
  const uniqueHs = [...goodsHs.values()];

  const bookingSize = firstVal(bookingDocs, "container_size") || (bookingDocs.flatMap((d) => (d.rawExtraction && d.rawExtraction.containers) || []).find((c) => !isEmpty(c.size)) || {}).size || "";
  const sbCount = firstVal(sbDocs, "number_of_containers") || (containers.length ? String(containers.length) : "");
  let containerTypeCount = "";
  if (!isEmpty(bookingSize) && !isEmpty(sbCount)) containerTypeCount = `${bookingSize} × ${sbCount}`;
  else if (!isEmpty(bookingSize)) containerTypeCount = bookingSize;
  else if (!isEmpty(sbCount)) containerTypeCount = `${sbCount} Container(s)`;

  const sbField = (key) => firstVal(sbDocs, key) || (isEmpty(fields[key]) ? "" : String(fields[key]));
  // In consolidated (Multiple LEO → Single HBL) mode, include EVERY unique value from
  // all LEOs (e.g. both invoices, both shipping bills); otherwise use the first value.
  const sbPick = (key) => {
    if (!options.consolidated) return sbField(key);
    const u = collectUnique(sbDocs, key);
    return u.length ? u.join(", ") : sbField(key);
  };
  const invNo = sbPick("invoice_number");
  const invDate = sbPick("invoice_date");
  const sbNo = sbPick("shipping_bill_number");
  const sbDate = sbPick("shipping_bill_date");
  const iec = sbPick("iec_number");

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
  // Net WT — only from the Shipping Instruction (never calculated from other docs).
  const siNetWt = firstVal(siDocs, "total_net_weight");
  addLine("netWt", "Net WT", siNetWt, { always: true, blank: isEmpty(siNetWt) });
  // FREIGHT — preserve the SI's original wording (PREPAID/COLLECT/etc.); else blank.
  const siFreight = firstVal(siDocs, "freight");
  addLine("freight", "FREIGHT", siFreight, { always: true, blank: isEmpty(siFreight) });
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
  // Consolidated mode: the total quantity / gross weight is the SUM across all LEOs
  // (each container still shows its own value below). Otherwise use the first value.
  const qty = (options.consolidated && sumWithUnit(sbDocs, "number_of_packages"))
    || firstVal(sbDocs, "number_of_packages") || (isEmpty(fields.number_of_packages) ? "" : String(fields.number_of_packages));
  const gw = (options.consolidated && sumWithUnit(sbDocs, "total_gross_weight"))
    || firstVal(sbDocs, "total_gross_weight") || (isEmpty(fields.total_gross_weight) ? "" : String(fields.total_gross_weight));

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

  // Consolidated MBL always shows the Total Quantity (PKG) and Total Gross Weight
  // (the sum across every LEO) beneath the individual shipment rows.
  const totals = (isMulti || options.consolidated) ? { quantity: qty, grossWeight: gw } : null;

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

  // Shipping Instruction priority for Shipper / Consignee / Notify Party: when the SI
  // provides these, they win; otherwise the values above (LEO / Shipping Bill / EDI)
  // are kept as the fallback. In Multiple-LEO mode this override is skipped — each
  // shipment's parties must come from its own LEO (a shared SI cannot dictate the
  // shipper/consignee for every different exporter).
  const applyOverride = (label, value) => {
    if (isEmpty(value)) return;
    const s = summary.find((x) => x.label === label);
    if (s) { s.value = value; s.found = true; s.blank = false; }
  };

  if (options.consolidated) {
    // Multiple-LEO with Single HBL: combine ALL unique parties from EVERY LEO so the
    // one consolidated HBL lists every exporter (and merges consignee / notify),
    // preserving each complete address and removing exact duplicates.
    const combineParties = (nameKey, addrKey) => {
      const blocks = [];
      for (const d of sbDocs) {
        let parts = [d.extractedFields && d.extractedFields[nameKey], d.extractedFields && d.extractedFields[addrKey]]
          .filter((x) => !isEmpty(x)).map(String);
        parts = parts.filter((p, i) => !parts.some((o, j) => j !== i && o.toLowerCase().includes(p.toLowerCase())));
        const block = parts.join("\n").trim();
        if (block && !blocks.some((b) => normKey(b) === normKey(block))) blocks.push(block);
      }
      return blocks.join("\n\n");
    };
    applyOverride("Shipper / Exporter", combineParties("exporter_name", "exporter_address"));
    applyOverride("Consignee", combineParties("consignee_name", "consignee_address"));
    applyOverride("Notify Party", combineParties("notify_party", "notify_party_address"));
    // NOTE: Marks & Numbers is intentionally NOT extracted in the consolidated
    // (Multiple LEO → Single HBL) workflow — it stays blank for manual entry in the
    // HBL / MBL / ISF documents.
  } else if (!options.multiLeo) {
    const siAddress = (nameKey, addrKey) => {
      let parts = [firstVal(siDocs, nameKey), firstVal(siDocs, addrKey)].filter((x) => !isEmpty(x)).map(String);
      parts = parts.filter((p, i) => !parts.some((o, j) => j !== i && o.toLowerCase().includes(p.toLowerCase())));
      return parts.join("\n");
    };
    applyOverride("Shipper / Exporter", siAddress("exporter_name", "exporter_address"));
    applyOverride("Consignee", siAddress("consignee_name", "consignee_address"));
    applyOverride("Notify Party", siAddress("notify_party", "notify_party_address"));
  }

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
