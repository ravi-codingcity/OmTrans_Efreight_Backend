const Quotation = require('../models/Quotation');

// @desc    Create a new quotation
// @route   POST /api/quotations
// @access  Public
const createQuotation = async (req, res) => {
  try {
    const quotationData = req.body;

    // Validate required fields
    if (!quotationData.id || !quotationData.quotationSegment) {
      return res.status(400).json({
        success: false,
        message: 'Please provide quotation ID and segment',
      });
    }

    // Check if quotation ID already exists
    const existingQuotation = await Quotation.findOne({ id: quotationData.id });
    if (existingQuotation) {
      return res.status(400).json({
        success: false,
        message: 'Quotation ID already exists',
      });
    }

    // Create quotation
    const quotation = await Quotation.create(quotationData);

    res.status(201).json({
      success: true,
      message: 'Quotation created successfully',
      data: quotation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all quotations
// @route   GET /api/quotations
// @access  Public
const getAllQuotations = async (req, res) => {
  try {
    const quotations = await Quotation.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: quotations.length,
      data: quotations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single quotation by ID
// @route   GET /api/quotations/:id
// @access  Public
const getQuotationById = async (req, res) => {
  try {
    const quotation = await Quotation.findOne({ id: req.params.id });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }

    res.json({
      success: true,
      data: quotation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update quotation
// @route   PUT /api/quotations/:id
// @access  Public
const updateQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }

    res.json({
      success: true,
      message: 'Quotation updated successfully',
      data: quotation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete quotation
// @route   DELETE /api/quotations/:id
// @access  Public
const deleteQuotation = async (req, res) => {
  try {
    const quotation = await Quotation.findOneAndDelete({ id: req.params.id });

    if (!quotation) {
      return res.status(404).json({
        success: false,
        message: 'Quotation not found',
      });
    }

    res.json({
      success: true,
      message: 'Quotation deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get quotations by segment
// @route   GET /api/quotations/segment/:segment
// @access  Public
const getQuotationsBySegment = async (req, res) => {
  try {
    const quotations = await Quotation.find({
      quotationSegment: req.params.segment,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: quotations.length,
      data: quotations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get quotations by user
// @route   GET /api/quotations/user/:username
// @access  Public
const getQuotationsByUser = async (req, res) => {
  try {
    const quotations = await Quotation.find({
      createdBy: req.params.username,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: quotations.length,
      data: quotations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createQuotation,
  getAllQuotations,
  getQuotationById,
  updateQuotation,
  deleteQuotation,
  getQuotationsBySegment,
  getQuotationsByUser,
};
