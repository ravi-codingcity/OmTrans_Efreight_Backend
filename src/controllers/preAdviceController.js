const PreAdvice = require('../models/PreAdvice');

// @desc    Create a new pre-advice
// @route   POST /api/pre-advice
// @access  Public
const createPreAdvice = async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    if (!data.jobNo) {
      return res.status(400).json({
        success: false,
        message: 'Job number is required',
      });
    }
    if (!data.createdBy) {
      return res.status(400).json({
        success: false,
        message: 'Created by is required',
      });
    }

    // Check if jobNo already exists
    const existing = await PreAdvice.findOne({ jobNo: data.jobNo });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A pre-advice with this job number already exists',
      });
    }

    const preAdvice = await PreAdvice.create(data);

    res.status(201).json({
      success: true,
      message: 'Pre-advice created successfully',
      data: preAdvice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all pre-advice records
// @route   GET /api/pre-advice
// @access  Public
const getAllPreAdvice = async (req, res) => {
  try {
    const preAdvices = await PreAdvice.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: preAdvices.length,
      data: preAdvices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single pre-advice by ID
// @route   GET /api/pre-advice/:id
// @access  Public
const getPreAdviceById = async (req, res) => {
  try {
    const preAdvice = await PreAdvice.findById(req.params.id);

    if (!preAdvice) {
      return res.status(404).json({
        success: false,
        message: 'Pre-advice not found',
      });
    }

    res.json({
      success: true,
      data: preAdvice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get pre-advice by job number
// @route   GET /api/pre-advice/job/:jobNo
// @access  Public
const getPreAdviceByJobNo = async (req, res) => {
  try {
    const preAdvice = await PreAdvice.findOne({ jobNo: req.params.jobNo });

    if (!preAdvice) {
      return res.status(404).json({
        success: false,
        message: 'Pre-advice not found',
      });
    }

    res.json({
      success: true,
      data: preAdvice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update pre-advice
// @route   PUT /api/pre-advice/:id
// @access  Public
const updatePreAdvice = async (req, res) => {
  try {
    const preAdvice = await PreAdvice.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!preAdvice) {
      return res.status(404).json({
        success: false,
        message: 'Pre-advice not found',
      });
    }

    res.json({
      success: true,
      message: 'Pre-advice updated successfully',
      data: preAdvice,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete pre-advice
// @route   DELETE /api/pre-advice/:id
// @access  Public
const deletePreAdvice = async (req, res) => {
  try {
    const preAdvice = await PreAdvice.findByIdAndDelete(req.params.id);

    if (!preAdvice) {
      return res.status(404).json({
        success: false,
        message: 'Pre-advice not found',
      });
    }

    res.json({
      success: true,
      message: 'Pre-advice deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get pre-advice records by creator
// @route   GET /api/pre-advice/user/:username
// @access  Public
const getPreAdviceByUser = async (req, res) => {
  try {
    const preAdvices = await PreAdvice.find({
      createdBy: req.params.username,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: preAdvices.length,
      data: preAdvices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get pre-advice records by customer
// @route   GET /api/pre-advice/customer/:name
// @access  Public
const getPreAdviceByCustomer = async (req, res) => {
  try {
    const preAdvices = await PreAdvice.find({
      customerName: { $regex: req.params.name, $options: 'i' },
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: preAdvices.length,
      data: preAdvices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createPreAdvice,
  getAllPreAdvice,
  getPreAdviceById,
  getPreAdviceByJobNo,
  updatePreAdvice,
  deletePreAdvice,
  getPreAdviceByUser,
  getPreAdviceByCustomer,
};
