const express = require("express");
const { authenticate, importAccess } = require("../../middleware/importAuth");
const { startComparison, getComparisonStatus, getStatus } = require("../controllers/verificationController");

const router = express.Router();

// All verification routes require a valid token + Import / Super Admin role.
router.use(authenticate, importAccess);

// Config / mock-mode status for the UI.
router.get("/status", getStatus);

// Async comparison — start returns a jobId immediately (PDFs arrive as base64 in a
// JSON body, parsed by the global express.json). The client then polls the status
// endpoint. Every request completes in <1s, so the hosting proxy never times out.
router.post("/compare", startComparison);
router.get("/compare/:jobId", getComparisonStatus);

module.exports = router;
