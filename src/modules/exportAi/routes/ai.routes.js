const express = require("express");
const { authenticate, requireAdmin } = require("../middleware/aiAuth");
const { listModels, listTemplates, checkModel, getUsageAnalytics } = require("../controllers/ai.controller");

const router = express.Router();
router.use(authenticate);

router.get("/models", listModels);
router.get("/templates", listTemplates);
router.get("/check", requireAdmin, checkModel);
router.get("/usage", requireAdmin, getUsageAnalytics);

module.exports = router;
