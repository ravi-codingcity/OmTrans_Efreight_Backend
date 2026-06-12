const express = require("express");
const {
  createHawb,
  getAllHawb,
  getHawbById,
  updateHawb,
  deleteHawb,
  generateHawbDocument,
} = require("../controllers/hawbController");
const {
  authenticate,
  importAccess,
  superAdminOnly,
} = require("../../middleware/importAuth");

const router = express.Router();

// All HAWB routes require a valid token + Import/Super Admin role.
router.use(authenticate, importAccess);

router.get("/:id/document", generateHawbDocument);

router.post("/", createHawb);
router.get("/", getAllHawb);
router.get("/:id", getHawbById);
router.put("/:id", updateHawb);

// Delete — Super Admin only
router.delete("/:id", superAdminOnly, deleteHawb);

module.exports = router;
