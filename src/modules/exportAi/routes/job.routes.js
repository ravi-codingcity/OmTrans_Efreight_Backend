const express = require("express");
const { authenticate } = require("../middleware/aiAuth");
const { uploadDocuments } = require("../middleware/upload");
const {
  createJob, listJobs, getJobsSummary, getJob, getJobStatus,
  downloadReport, saveReportData, generateReport,
  getMblData, saveMblData, generateMblReport,
  getIsfData, saveIsfData, generateIsfReport, deleteJob,
} = require("../controllers/job.controller");

const router = express.Router();
router.use(authenticate);

router.post("/", uploadDocuments, createJob);
router.get("/", listJobs);
router.get("/summary", getJobsSummary); // must precede '/:id'
router.get("/:id", getJob);
router.get("/:id/status", getJobStatus);
router.get("/:id/report", downloadReport);
router.patch("/:id/report-data", saveReportData);
router.post("/:id/generate", generateReport);
router.get("/:id/mbl", getMblData);
router.patch("/:id/mbl-data", saveMblData);
router.post("/:id/mbl/generate", generateMblReport);
router.get("/:id/isf", getIsfData);
router.patch("/:id/isf-data", saveIsfData);
router.post("/:id/isf/generate", generateIsfReport);
router.delete("/:id", deleteJob);

module.exports = router;
