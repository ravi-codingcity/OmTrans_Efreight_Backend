const express = require("express");
const { authenticate, requireAdmin } = require("../middleware/aiAuth");
const { listModels, listTemplates, checkModel } = require("../controllers/ai.controller");

const router = express.Router();
router.use(authenticate);

router.get("/models", listModels);
router.get("/templates", listTemplates);
router.get("/check", requireAdmin, checkModel);

module.exports = router;
