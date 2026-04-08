const express = require("express");
const {
  createLoginRecord,
  getAllLoginRecords,
  recordLogout,
} = require("../controllers/loginInfoController");

const router = express.Router();

router.post("/", createLoginRecord);
router.get("/", getAllLoginRecords);
router.patch("/:id/logout", recordLogout);

module.exports = router;
