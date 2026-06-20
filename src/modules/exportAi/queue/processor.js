const path = require("node:path");
const fs = require("node:fs");
const { Job } = require("../models/Job");
const { Document } = require("../models/Document");
const { JOB_STATUS, DOC_STATUS } = require("../utils/constants");
const { aiConfig } = require("../config/aiConfig");
const { logger } = require("../config/logger");
const { extractDocument, describeAiError, verifyGemini } = require("../services/gemini.service");
const { reconcileDocuments } = require("../services/comparison.service");
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
    const recon = reconcileDocuments(extracted);

    job.consolidated = {
      fields: recon.consolidated,
      comparison: recon.comparison,
      discrepancies: recon.discrepancies,
      missingFields: recon.missingFields,
      validationScore: recon.validationScore,
    };
    await updateStatus(job, JOB_STATUS.GENERATING, 88, "Building shipment report");

    const fresh = await Job.findById(job._id);
    fresh.consolidated = job.consolidated;
    fresh.aiModelUsed = usedModel;
    fresh.aiUsage = {
      model: usedModel,
      analyses: aiTally.analyses,
      inputTokens: aiTally.inputTokens,
      outputTokens: aiTally.outputTokens,
      totalTokens: aiTally.totalTokens,
      costUsd: Number(estimateCost(usedModel, aiTally.inputTokens, aiTally.outputTokens).toFixed(6)),
    };

    const location = fresh.location || "";
    const srData = buildShipmentReportData(job.consolidated, extracted, { location });
    fresh.analysis = { ...buildAnalysis(job.consolidated, extracted), weightCheck: srData.weightCheck || null };

    const firstBooking = (list) => list.map((d) => d.extractedFields && d.extractedFields.booking_number).find((x) => x && String(x).trim());
    const bookingDocs = extracted.filter((d) => d.detectedType === "booking_confirmation" || /booking/i.test(d.originalName || ""));
    const egateDocs = extracted.filter((d) => d.detectedType === "egate" || d.detectedType === "form_10" || /e[\s-]?gate|sez[\s-]*4|form[\s_-]*13|form[\s_-]*6(?!\d)|form[\s_-]*10/i.test(d.originalName || ""));
    const bookingNumber = firstBooking(bookingDocs) || firstBooking(egateDocs) || firstBooking(extracted);
    srData.hblNumber = fresh.hblNumber || "";
    srData.bookingNumber = bookingNumber || "";

    fresh.shipmentReport = { data: srData, aiData: srData, generated: false };
    fresh.status = JOB_STATUS.COMPLETED;
    fresh.progress = 100;
    fresh.statusMessage = "Completed — review & generate";
    fresh.completedAt = new Date();
    await fresh.save();
    logger.info("Job completed", { jobId: String(job._id), score: recon.validationScore });
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
