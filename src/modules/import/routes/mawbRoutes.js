const express = require("express");
const {
  createMawb,
  getAllMawb,
  getMawbById,
  updateMawb,
  deleteMawb,
  generateMawbDocument,
  downloadMawbDocument,
} = require("../controllers/mawbController");
const {
  authenticate,
  importAccess,
  superAdminOnly,
} = require("../middleware/importAuth");

const router = express.Router();

// All Import routes require a valid token + Import/Super Admin role.
router.use(authenticate, importAccess);

// Document generation / download (define before generic /:id is fine — distinct suffixes)
router.get("/:id/document", generateMawbDocument);
router.get("/:id/download", downloadMawbDocument);

// CRUD
router.post("/", createMawb);
router.get("/", getAllMawb);
router.get("/:id", getMawbById);
router.put("/:id", updateMawb);

// Delete — Super Admin only
router.delete("/:id", superAdminOnly, deleteMawb);

module.exports = router;
