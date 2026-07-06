const express = require("express");
const { authenticate, importAccess } = require("../../middleware/importAuth");
const { geminiConfig } = require("../config/geminiConfig");
const { compareDocuments, getStatus } = require("../controllers/verificationController");

const router = express.Router();

// All verification routes require a valid token + Import / Super Admin role.
router.use(authenticate, importAccess);

router.get("/status", getStatus);

// Give the AI comparison enough socket time so Node itself never times out before
// our own aiTimeoutMs returns a clean JSON error.
const allowLongRequest = (req, res, next) => {
  const ms = geminiConfig.aiTimeoutMs + 30000;
  if (req.setTimeout) req.setTimeout(ms);
  if (res.setTimeout) res.setTimeout(ms);
  next();
};

// PDFs arrive as base64 inside a JSON body (identical request style to the working
// MAWB/HAWB endpoints) — parsed by the global express.json (60mb limit). This avoids
// multipart uploads, which some hosting proxies 307-redirect.
router.post("/compare", allowLongRequest, compareDocuments);

module.exports = router;
