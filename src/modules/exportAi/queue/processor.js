const path = require("node:path");
const fs = require("node:fs");
const { Job } = require("../models/Job");
const { Document } = require("../models/Document");
const { JOB_STATUS, DOC_STATUS } = require("../utils/constants");
const { aiConfig } = require("../config/aiConfig");
const { logger } = require("../config/logger");
const { extractDocument, describeAiError, verifyGemini } = require("../services/gemini.service");
const { reconcileDocuments, isPriorityDoc, isShippingInstruction } = require("../services/comparison.service");
const { buildShipmentReportData } = require("../services/shipmentReport.service");
const { buildAnalysis } = require("../services/analysis.service");
const { detectDocTypeFromName } = require("../utils/docType");
const { safeRmDir } = require("../utils/files");
const { estimateCost } = require("../config/aiModels");
const { jobQueue } = require("./jobQueue");

async function updateStatus(job, status, progress, message) {
  job.status = status;
  if (progress !== undefined) job.progress = progress;
  if (message) job.statusMessage = message;
  await job.save();
}

// Booking number is a shared detail — take it from the Booking Confirmation, then
// E-Gate / Form 10, then any document.
function bookingNumberOf(docs) {
  const firstBooking = (list) => list.map((d) => d.extractedFields && d.extractedFields.booking_number).find((x) => x && String(x).trim());
  const bookingDocs = docs.filter((d) => d.detectedType === "booking_confirmation" || /booking/i.test(d.originalName || ""));
  const egateDocs = docs.filter((d) => d.detectedType === "egate" || d.detectedType === "form_10" || /e[\s-]?gate|sez[\s-]*4|form[\s_-]*13|form[\s_-]*6(?!\d)|form[\s_-]*10/i.test(d.originalName || ""));
  return firstBooking(bookingDocs) || firstBooking(egateDocs) || firstBooking(docs) || "";
}

// Clone the extracted metadata of a shipment's documents onto a new job (raw files
// are already gone; only the extracted data is needed for later HBL/MBL/ISF builds).
async function cloneDocsForJob(docs, jobId) {
  const ids = [];
  for (const d of docs) {
    const raw = { ...(d.rawExtraction || {}) };
    delete raw._tmpPath;
    const copy = await Document.create({
      job: jobId,
      originalName: d.originalName,
      mimeType: d.mimeType,
      extension: d.extension,
      sizeBytes: d.sizeBytes,
      checksum: d.checksum,
      status: d.status,
      detectedType: d.detectedType,
      confidence: d.confidence,
      extractedFields: d.extractedFields || {},
      rawExtraction: raw,
      fileDeleted: true,
    });
    ids.push(copy._id);
  }
  return ids;
}

/** Full analysis pipeline for one job: analyse each doc → reconcile → build review data. */
async function processJob({ jobId, batchDir }) {
  const job = await Job.findById(jobId).populate("documents");
  if (!job) { logger.warn("processJob: job not found", { jobId }); return; }

  try {
    job.startedAt = new Date();
    const docs = job.documents;
    const total = docs.length;
    const selectedModel = job.aiModel;
    let usedModel;

    await updateStatus(job, JOB_STATUS.ANALYZING, 8, "Detecting document types");
    for (const docMeta of docs) {
      docMeta.detectedType = detectDocTypeFromName(docMeta.originalName) || "unknown";
      await docMeta.save();
    }

    if (!aiConfig.gemini.mockMode) {
      await updateStatus(job, JOB_STATUS.ANALYZING, 12, "Verifying AI model & credentials");
      const probe = await verifyGemini(selectedModel);
      if (!probe.ok) {
        const { code, message } = describeAiError(probe.error);
        if (code === "AI_CREDITS" || code === "AI_AUTH") {
          for (const docMeta of docs) { docMeta.status = DOC_STATUS.FAILED; docMeta.error = message; await docMeta.save(); }
          throw new Error(message);
        }
        logger.warn("AI pre-flight warning (continuing)", { job: String(job._id), code, error: probe.error });
      }
    }

    const errorCounts = {};
    const aiTally = { inputTokens: 0, outputTokens: 0, totalTokens: 0, analyses: 0 };
    let completed = 0;
    await updateStatus(job, JOB_STATUS.ANALYZING, 15, `Analyzing ${total} document(s) with Gemini AI…`);

    const bumpProgress = () => {
      const progress = 15 + Math.round((completed / total) * 55);
      return Job.updateOne(
        { _id: job._id },
        { $set: { status: JOB_STATUS.ANALYZING, progress, statusMessage: `Analyzing with Gemini AI — ${completed} of ${total} documents` } }
      ).catch(() => {});
    };

    const processDoc = async (docMeta) => {
      const filePath = docMeta.rawExtraction && docMeta.rawExtraction._tmpPath;
      try {
        if (!filePath || !fs.existsSync(filePath)) throw new Error("ENOENT: uploaded file is missing on the server");
        docMeta.status = DOC_STATUS.EXTRACTING;
        await docMeta.save();

        const extraction = await extractDocument({ filePath, mimeType: docMeta.mimeType, originalName: docMeta.originalName, model: selectedModel });
        usedModel = extraction.usedModel || usedModel;
        if (extraction.usage) {
          aiTally.inputTokens += extraction.usage.inputTokens || 0;
          aiTally.outputTokens += extraction.usage.outputTokens || 0;
          aiTally.totalTokens += extraction.usage.totalTokens || 0;
          aiTally.analyses += 1;
        }
        docMeta.detectedType = extraction.detectedType || docMeta.detectedType;
        docMeta.confidence = extraction.confidence;
        docMeta.extractedFields = extraction.fields || {};
        docMeta.rawExtraction = {
          lineItems: extraction.lineItems,
          hsCodes: extraction.hsCodes || [],
          seals: extraction.seals || [],
          containers: extraction.containers || [],
          notes: extraction.notes,
        };
        docMeta.error = undefined;
        docMeta.status = DOC_STATUS.EXTRACTED;
        await docMeta.save();
      } catch (err) {
        const { code, message } = describeAiError(err);
        errorCounts[message] = (errorCounts[message] || 0) + 1;
        logger.error("Document extraction failed", { job: String(job._id), file: docMeta.originalName, code, error: err.message });
        docMeta.status = DOC_STATUS.FAILED;
        docMeta.error = message;
        docMeta.rawExtraction = {};
        await docMeta.save();
      } finally {
        completed += 1;
        await bumpProgress();
      }
    };

    const CONCURRENCY = Math.min(4, total);
    let cursor = 0;
    const runner = async () => { while (cursor < docs.length) await processDoc(docs[cursor++]); };
    await Promise.all(Array.from({ length: CONCURRENCY }, runner));

    await updateStatus(job, JOB_STATUS.GENERATING, 75, "Extracting & cross-referencing data");
    const extracted = await Document.find({ job: job._id, status: DOC_STATUS.EXTRACTED });
    if (extracted.length === 0) {
      const reason = Object.entries(errorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "AI analysis failed for all documents";
      throw new Error(reason);
    }

    const location = job.location || "";
    const fullUsage = {
      model: usedModel,
      analyses: aiTally.analyses,
      inputTokens: aiTally.inputTokens,
      outputTokens: aiTally.outputTokens,
      totalTokens: aiTally.totalTokens,
      costUsd: Number(estimateCost(usedModel, aiTally.inputTokens, aiTally.outputTokens).toFixed(6)),
    };
    const zeroUsage = { model: usedModel, analyses: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

    // A shipment is built from one LEO/Shipping Bill + the shared documents.
    const buildShipment = (docs, hblNumber, multiLeo = false) => {
      const recon = reconcileDocuments(docs);
      const consolidated = {
        fields: recon.consolidated,
        comparison: recon.comparison,
        discrepancies: recon.discrepancies,
        missingFields: recon.missingFields,
        validationScore: recon.validationScore,
      };
      const srData = buildShipmentReportData(consolidated, docs, { location, multiLeo });
      srData.hblNumber = hblNumber || "";
      srData.bookingNumber = bookingNumberOf(docs) || "";
      const analysis = { ...buildAnalysis(consolidated, docs), weightCheck: srData.weightCheck || null };
      return { consolidated, srData, analysis };
    };

    // LEO / Shipping Bill / INDIAN CUSTOMS EDI documents drive the shipments.
    const leoDocs = extracted.filter(isPriorityDoc);
    const isMulti = job.shipmentType === "multiple" && leoDocs.length >= 2;

    await updateStatus(job, JOB_STATUS.GENERATING, 88, isMulti ? `Building ${leoDocs.length} shipments` : "Building shipment report");

    if (!isMulti) {
      // ── Single-LEO workflow (unchanged) ──
      const { consolidated, srData, analysis } = buildShipment(extracted, job.hblNumber);
      const leo0 = leoDocs[0];
      const fresh = await Job.findById(job._id);
      fresh.consolidated = consolidated;
      fresh.aiModelUsed = usedModel;
      fresh.aiUsage = fullUsage;
      fresh.analysis = analysis;
      fresh.exporterName = (leo0 && leo0.extractedFields && leo0.extractedFields.exporter_name) || "";
      fresh.shippingBillNumber = (leo0 && leo0.extractedFields && leo0.extractedFields.shipping_bill_number) || "";
      fresh.shipmentReport = { data: srData, aiData: srData, generated: false };
      fresh.status = JOB_STATUS.COMPLETED;
      fresh.progress = 100;
      fresh.statusMessage = "Completed — review & generate";
      fresh.completedAt = new Date();
      await fresh.save();
      logger.info("Job completed", { jobId: String(job._id), score: consolidated.validationScore });
    } else {
      // ── Multiple-LEO workflow ──
      // Shared docs (Booking, Forwarding Note, E-Gate, Invoice, Packing, …) apply to
      // every shipment. The Shipping Instruction is excluded so each shipment's
      // SHIPPER comes from its own LEO's EXPORTER'S NAME & ADDRESS.
      const sharedDocs = extracted.filter((d) => !isPriorityDoc(d) && !isShippingInstruction(d));

      for (let i = 0; i < leoDocs.length; i += 1) {
        const leo = leoDocs[i];
        const docsForShipment = [leo, ...sharedDocs];
        const { consolidated, srData, analysis } = buildShipment(docsForShipment, "", true);
        const exporterName = (leo.extractedFields && leo.extractedFields.exporter_name) || "";
        const shippingBillNumber = (leo.extractedFields && leo.extractedFields.shipping_bill_number) || "";
        const statusMessage = `Shipment ${i + 1} of ${leoDocs.length} — review & generate`;

        if (i === 0) {
          // Shipment 1 reuses the original (parent) job and carries the full AI usage.
          const fresh = await Job.findById(job._id);
          fresh.consolidated = consolidated;
          fresh.aiModelUsed = usedModel;
          fresh.aiUsage = fullUsage;
          fresh.analysis = analysis;
          fresh.exporterName = exporterName;
          fresh.shippingBillNumber = shippingBillNumber;
          fresh.shipmentIndex = 1;
          fresh.shipmentReport = { data: srData, aiData: srData, generated: false };
          fresh.status = JOB_STATUS.COMPLETED;
          fresh.progress = 100;
          fresh.statusMessage = statusMessage;
          fresh.completedAt = new Date();
          await fresh.save();
        } else {
          // Shipments 2..N are independent jobs linked by the same uploadSessionId.
          const child = await Job.create({
            owner: job.owner,
            jobNumber: `${job.jobNumber} - S${i + 1}`,
            hblNumber: "",
            location,
            aiModel: job.aiModel,
            aiModelUsed: usedModel,
            outputTemplate: job.outputTemplate,
            uploadSessionId: job.uploadSessionId,
            shipmentType: "multiple",
            shipmentIndex: i + 1,
            exporterName,
            shippingBillNumber,
            aiUsage: zeroUsage,
            consolidated,
            analysis,
            shipmentReport: { data: srData, aiData: srData, generated: false },
            status: JOB_STATUS.COMPLETED,
            progress: 100,
            statusMessage,
            completedAt: new Date(),
          });
          // Each shipment job owns its own copies of its documents so MBL/ISF
          // generation (which reads job.documents) works independently later.
          child.documents = await cloneDocsForJob(docsForShipment, child._id);
          await child.save();
        }
      }
      logger.info("Multi-LEO job split", { session: job.uploadSessionId, shipments: leoDocs.length });
    }
  } catch (err) {
    logger.error("Job processing failed", { jobId: String(jobId), error: err.message });
    job.status = JOB_STATUS.FAILED;
    job.error = err.message;
    job.statusMessage = err.message;
    await job.save();
  } finally {
    const dir = batchDir || path.resolve(aiConfig.uploadTmpDir, String(job._id));
    await safeRmDir(dir);
    await Document.updateMany({ job: job._id }, { $set: { fileDeleted: true }, $unset: { "rawExtraction._tmpPath": "" } });
  }
}

jobQueue.setWorker(processJob);

function enqueueJob(jobId, batchDir) {
  jobQueue.enqueue({ jobId, batchDir });
}

module.exports = { enqueueJob };
