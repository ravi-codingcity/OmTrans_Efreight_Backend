const express = require("express");
const {
  createLoginRecord,
  getAllLoginRecords,
} = require("../controllers/loginInfoController");

const router = express.Router();

router.post("/", createLoginRecord);
router.get("/", getAllLoginRecords);

module.exports = router;
