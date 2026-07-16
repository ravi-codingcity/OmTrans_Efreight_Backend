const fs = require("node:fs");
const path = require("node:path");
const { v4: uuid } = require("uuid");
const { Job } = require("../models/Job");
const { Document } = require("../models/Document");
const { ApiError } = require("../utils/ApiError");
const { asyncHandler } = require("../utils/asyncHandler");
const { aiConfig } = require("../config/aiConfig");
const { JOB_STATUS, ALLOWED_MIME, OUTPUT_TEMPLATES } = require("../utils/constants");
const { resolveModel } = require("../config/aiModels");
const { resolveTemplate } = require("../config/templates");
const { sha256File, safeRmDir } = require("../utils/files");
const { enqueueJob } = require("../queue/processor");
const { isAdminRole } = require("../middleware/aiAuth");
const { generateHblReports, generateMblReports } = require("../services/hblTemplate.service");
const { buildMblFromHbl } = require("../services/mbl.service");
const { generateIsfReports } = require("../services/isfTemplate.service");
const { buildIsfFromShipment } = require("../services/isf.service");

// Owner can always see their own jobs; admins can see any.
function assertCanAccess(job, user) {
  const owner = String((job.owner && job.owner._id) || job.owner);
  const isOwner = owner === String(user._id);
  if (!isOwner && !isAdminRole(user.role)) throw ApiError.forbidden("You cannot access this job");
}

const createJob = asyncHandler(async (req, res) => {
  const files = req.files || [];
  const batchDir = req.uploadBatchId ? path.resolve(aiConfig.uploadTmpDir, req.uploadBatchId) : null;

  if (files.length < aiConfig.minFilesPerJob) {
    if (batchDir) await safeRmDir(batchDir);
    throw ApiError.badRequest(`Please upload between ${aiConfig.minFilesPerJob} and ${aiConfig.maxFilesPerJob} documents`);
  }

  const jobNumber = String((req.body && req.body.jobNumber) || "").trim();
  if (!jobNumber) {
    if (batchDir) await safeRmDir(batchDir);
    throw ApiError.badRequest("Job number is required");
  }

  const aiModel = resolveModel((req.body && req.body.model) || req.user.preferredAiModel);
  const rawShipmentType = String((req.body && req.body.shipmentType) || "single").toLowerCase();
  const shipmentType = ["single", "multiple", "multiple_single"].includes(rawShipmentType) ? rawShipmentType : "single";

  const job = await Job.create({
    owner: req.user._id,
    jobNumber,
    hblNumber: (req.body && req.body.hblNumber) || "",
    location: req.user.location || "",
    aiModel,
    outputTemplate: resolveTemplate(req.body && req.body.outputTemplate),
    uploadSessionId: uuid(),
    shipmentType,
    shipmentIndex: 1,
    status: JOB_STATUS.UPLOADING,
    progress: 5,
    statusMessage: "Uploaded — queued for analysis",
  });

  const docIds = [];
  for (const f of files) {
    const checksum = await sha256File(f.path).catch(() => undefined);
    const doc = await Document.create({
      job: job._id,
      originalName: f.originalname,
      mimeType: f.mimetype,
      extension: ALLOWED_MIME[f.mimetype],
      sizeBytes: f.size,
      checksum,
      rawExtraction: { _tmpPath: f.path },
    });
    docIds.push(doc._id);
  }

  job.documents = docIds;
  await job.save();
  enqueueJob(job._id, batchDir);

  res.status(202).json({
    success: true,
    message: "Documents uploaded. Processing started.",
    job: { id: job._id, status: job.status, progress: job.progress, statusMessage: job.statusMessage },
  });
});

const listJobs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { status, q, jobNumber, hblNumber, reportType, dateFrom, dateTo } = req.query;
  const sort = ["jobNumber", "hblNumber", "createdAt", "status"].includes(req.query.sort) ? req.query.sort : "createdAt";
  const order = req.query.order === "asc" ? 1 : -1;
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const filter = {};
  if (!isAdminRole(req.user.role)) filter.owner = req.user._id;
  if (status) filter.status = status;
  if (reportType) filter.outputTemplate = reportType;
  if (jobNumber) filter.jobNumber = new RegExp(esc(jobNumber), "i");
  if (hblNumber) filter.hblNumber = new RegExp(esc(hblNumber), "i");
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); filter.createdAt.$lte = end; }
  }
  // A Multiple-LEO upload session is ONE dashboard entry: only its parent (shipment 1)
  // appears in the paginated list; the remaining shipments are nested under it.
  const andClauses = [{ $or: [{ shipmentType: { $ne: "multiple" } }, { shipmentIndex: 1 }] }];
  if (q) andClauses.push({ $or: [{ jobNumber: new RegExp(esc(q), "i") }, { hblNumber: new RegExp(esc(q), "i") }] });
  filter.$and = andClauses;

  const [items, total] = await Promise.all([
    Job.find(filter)
      .collation({ locale: "en", numericOrdering: true })
      .sort({ [sort]: order })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("owner", "fullName username")
      .select("-consolidated.comparison -analysis -shipmentReport.data -shipmentReport.aiData -mbl.data -isf.data")
      .lean(),
    Job.countDocuments(filter),
  ]);

  // Attach each Multiple-LEO session's shipments (lightweight) to its parent so the
  // Dashboard can expand the group without an extra request.
  const sessionIds = items
    .filter((j) => j.shipmentType === "multiple" && j.uploadSessionId)
    .map((j) => j.uploadSessionId);
  if (sessionIds.length) {
    const members = await Job.find({ uploadSessionId: { $in: sessionIds } })
      .sort({ shipmentIndex: 1 })
      .populate("owner", "fullName username")
      .select("uploadSessionId shipmentIndex shipmentType jobNumber hblNumber exporterName shippingBillNumber status progress createdAt documents shipmentReport.generated")
      .lean();
    const bySession = {};
    members.forEach((m) => { (bySession[m.uploadSessionId] = bySession[m.uploadSessionId] || []).push(m); });
    items.forEach((j) => {
      if (j.shipmentType === "multiple" && j.uploadSessionId) {
        j.sessionShipments = bySession[j.uploadSessionId] || [];
        j.sessionCount = j.sessionShipments.length || 1;
      }
    });
  }

  res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getJobsSummary = asyncHandler(async (req, res) => {
  const base = isAdminRole(req.user.role) ? {} : { owner: req.user._id };
  const [total, completed, hblGenerated, mblGenerated, isfGenerated, pendingReviews] = await Promise.all([
    Job.countDocuments(base),
    Job.countDocuments({ ...base, status: JOB_STATUS.COMPLETED }),
    Job.countDocuments({ ...base, "shipmentReport.generated": true }),
    Job.countDocuments({ ...base, "mbl.generated": true }),
    Job.countDocuments({ ...base, "isf.generated": true }),
    Job.countDocuments({ ...base, status: JOB_STATUS.COMPLETED, "shipmentReport.generated": { $ne: true } }),
  ]);
  res.json({ success: true, summary: { total, completed, hblGenerated, mblGenerated, isfGenerated, pendingReviews } });
});

const getJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).populate("owner", "fullName username").populate("documents");
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  res.json({ success: true, job });
});

const getJobStatus = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).select("owner status progress statusMessage error shipmentReport.generated consolidated.validationScore");
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  res.json({
    success: true,
    status: job.status,
    progress: job.progress,
    statusMessage: job.statusMessage,
    error: job.error,
    validationScore: job.consolidated && job.consolidated.validationScore,
    reportReady: Boolean(job.shipmentReport && job.shipmentReport.generated),
  });
});

const saveReportData = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  if (!(job.shipmentReport && job.shipmentReport.data)) throw ApiError.badRequest("No report data to edit");

  const incoming = req.body && req.body.data;
  if (!incoming || typeof incoming !== "object") throw ApiError.badRequest("Missing edited data");

  job.shipmentReport.data = incoming;
  job.shipmentReport.generated = false;
  job.shipmentReport.savedAt = new Date();
  if (typeof incoming.hblNumber === "string" && incoming.hblNumber.trim()) job.hblNumber = incoming.hblNumber.trim();
  job.markModified("shipmentReport");
  await job.save();
  res.json({ success: true, data: job.shipmentReport.data, hblNumber: job.hblNumber });
});

const saveMblData = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  const incoming = req.body && req.body.data;
  if (!incoming || typeof incoming !== "object") throw ApiError.badRequest("Missing edited data");
  job.mbl = job.mbl || {};
  job.mbl.data = incoming;
  job.mbl.generated = false;
  job.mbl.savedAt = new Date();
  job.markModified("mbl");
  await job.save();
  res.json({ success: true, data: job.mbl.data });
});

const saveIsfData = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  const incoming = req.body && req.body.data;
  if (!incoming || typeof incoming !== "object") throw ApiError.badRequest("Missing edited data");
  job.isf = job.isf || {};
  job.isf.data = incoming;
  job.isf.generated = false;
  job.isf.savedAt = new Date();
  job.markModified("isf");
  await job.save();
  res.json({ success: true, data: job.isf.data });
});

/** Generate the final HBL Word + PDF from the (possibly edited) shipment data. */
const generateReport = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  if (job.status !== JOB_STATUS.COMPLETED || !(job.shipmentReport && job.shipmentReport.data)) {
    throw ApiError.badRequest("Report data is not ready");
  }
  const sr = await generateHblReports(job._id, job.shipmentReport.data);
  job.shipmentReport.pdfPath = sr.pdfPath;
  job.shipmentReport.docxPath = sr.docxPath;
  job.shipmentReport.pdfEngine = sr.pdfEngine;
  job.shipmentReport.generated = true;
  job.shipmentReport.generatedAt = new Date();
  const hbl = job.shipmentReport.data && job.shipmentReport.data.hblNumber;
  if (typeof hbl === "string" && hbl.trim()) job.hblNumber = hbl.trim();
  job.markModified("shipmentReport");
  await job.save();
  res.json({ success: true, generated: true, pdf: Boolean(sr.pdfPath), docx: Boolean(sr.docxPath), pdfEngine: sr.pdfEngine });
});

/** Load (deriving once from the HBL) the MBL data for editing. */
const getMblData = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  if (!(job.shipmentReport && job.shipmentReport.data)) throw ApiError.badRequest("Finalize the HBL before creating an MBL");
  if (!(job.mbl && job.mbl.data)) {
    job.mbl = job.mbl || {};
    job.mbl.data = buildMblFromHbl(job.shipmentReport.data);
    job.mbl.generated = false;
    job.markModified("mbl");
    await job.save();
  }
  res.json({ success: true, data: job.mbl.data, generated: Boolean(job.mbl.generated), pdfEngine: job.mbl.pdfEngine, dataSources: job.mblDataSources || null, jobNumber: job.jobNumber });
});

/** Generate the final MBL Word + PDF from the (edited) MBL data. */
const generateMblReport = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  if (!(job.mbl && job.mbl.data)) throw ApiError.badRequest("MBL data is not ready");
  const mr = await generateMblReports(job._id, job.mbl.data);
  job.mbl.pdfPath = mr.pdfPath;
  job.mbl.docxPath = mr.docxPath;
  job.mbl.pdfEngine = mr.pdfEngine;
  job.mbl.generated = true;
  job.mbl.generatedAt = new Date();
  job.markModified("mbl");
  await job.save();
  res.json({ success: true, generated: true, pdf: Boolean(mr.pdfPath), docx: Boolean(mr.docxPath), pdfEngine: mr.pdfEngine });
});

/** Load (deriving once from the finalized HBL/MBL + Booking doc) the ISF data. */
const getIsfData = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).populate("documents");
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  if (!(job.shipmentReport && job.shipmentReport.generated)) throw ApiError.badRequest("Generate the HBL before creating an ISF");
  if (!(job.isf && job.isf.data)) {
    job.isf = job.isf || {};
    job.isf.data = buildIsfFromShipment(job.shipmentReport.data, job.mbl && job.mbl.data, job.documents || [], {
      consolidated: job.shipmentType === "multiple_single",
    });
    job.isf.generated = false;
    job.markModified("isf");
    await job.save();
  }
  res.json({ success: true, data: job.isf.data, generated: Boolean(job.isf.generated), pdfEngine: job.isf.pdfEngine, shipmentType: job.shipmentType, jobNumber: job.jobNumber });
});

/** Generate the final ISF Word + PDF from the (edited) ISF data. */
const generateIsfReport = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  if (!(job.isf && job.isf.data)) throw ApiError.badRequest("ISF data is not ready");
  const ir = await generateIsfReports(job._id, job.isf.data);
  job.isf.pdfPath = ir.pdfPath;
  job.isf.docxPath = ir.docxPath;
  job.isf.pdfEngine = ir.pdfEngine;
  job.isf.generated = true;
  job.isf.generatedAt = new Date();
  job.markModified("isf");
  await job.save();
  res.json({ success: true, generated: true, pdf: Boolean(ir.pdfPath), docx: Boolean(ir.docxPath), pdfEngine: ir.pdfEngine });
});

const downloadReport = asyncHandler(async (req, res) => {
  const format = req.query.format === "docx" ? "docx" : "pdf";
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  assertCanAccess(job, req.user);
  if (job.status !== JOB_STATUS.COMPLETED) throw ApiError.badRequest("Report is not ready yet");

  const template = req.query.template || job.outputTemplate || OUTPUT_TEMPLATES.SHIPMENT_REPORT;
  const source = template === "mbl" ? job.mbl : template === "isf" ? job.isf : job.shipmentReport;
  const filePath = format === "docx" ? source && source.docxPath : source && source.pdfPath;
  if (!filePath || !fs.existsSync(filePath)) throw ApiError.badRequest("Document not generated yet — review and generate it first");

  const safeTitle = String(job.jobNumber || "document").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
  const suffix = template === "mbl" ? "mbl" : template === "isf" ? "isf" : "shipment-report";
  res.download(filePath, `${safeTitle || "document"}-${suffix}.${format}`);
});

const deleteJob = asyncHandler(async (req, res) => {
  if (!isAdminRole(req.user.role)) throw ApiError.forbidden("Only administrators can delete records");
  const job = await Job.findById(req.params.id);
  if (!job) throw ApiError.notFound("Job not found");
  await safeRmDir(path.resolve(aiConfig.reportDir, String(job._id)));
  await Document.deleteMany({ job: job._id });
  await job.deleteOne();
  res.json({ success: true, message: "Job deleted" });
});

module.exports = {
  createJob, listJobs, getJobsSummary, getJob, getJobStatus,
  downloadReport, saveReportData, generateReport,
  getMblData, saveMblData, generateMblReport,
  getIsfData, saveIsfData, generateIsfReport, deleteJob,
};
