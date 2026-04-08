const LoginInfo = require("../models/LoginInfo");

// @desc    Record a user login
// @route   POST /api/login-info
// @access  Public (called from login flow)
const createLoginRecord = async (req, res) => {
  try {
    const { username, fullName, role } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Username is required",
      });
    }

    const record = await LoginInfo.create({
      username,
      fullName: fullName || "",
      role: role || "User",
      loginAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Login recorded",
      data: record,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all login records
// @route   GET /api/login-info
// @access  Super Admin
const getAllLoginRecords = async (req, res) => {
  try {
    const records = await LoginInfo.find().sort({ loginAt: -1 });

    res.json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createLoginRecord,
  getAllLoginRecords,
};
