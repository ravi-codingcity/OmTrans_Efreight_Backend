const RateFiling = require('../models/RateFiling');

// @desc    Create a new rate filing
// @route   POST /api/rate-filings
// @access  Public
const createRateFiling = async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    if (!data.name) {
      return res.status(400).json({
        success: false,
        message: 'Name is required',
      });
    }
    if (!data.pol || !data.pod) {
      return res.status(400).json({
        success: false,
        message: 'Port of Loading (POL) and Port of Discharge (POD) are required',
      });
    }

    const rateFiling = await RateFiling.create(data);

    res.status(201).json({
      success: true,
      message: 'Rate filing created successfully',
      data: rateFiling,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all rate filings
// @route   GET /api/rate-filings
// @access  Public
const getAllRateFilings = async (req, res) => {
  try {
    const rateFilings = await RateFiling.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: rateFilings.length,
      data: rateFilings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single rate filing by ID
// @route   GET /api/rate-filings/:id
// @access  Public
const getRateFilingById = async (req, res) => {
  try {
    const rateFiling = await RateFiling.findById(req.params.id);

    if (!rateFiling) {
      return res.status(404).json({
        success: false,
        message: 'Rate filing not found',
      });
    }

    res.json({
      success: true,
      data: rateFiling,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update rate filing
// @route   PUT /api/rate-filings/:id
// @access  Public
const updateRateFiling = async (req, res) => {
  try {
    const rateFiling = await RateFiling.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!rateFiling) {
      return res.status(404).json({
        success: false,
        message: 'Rate filing not found',
      });
    }

    res.json({
      success: true,
      message: 'Rate filing updated successfully',
      data: rateFiling,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete rate filing
// @route   DELETE /api/rate-filings/:id
// @access  Public
const deleteRateFiling = async (req, res) => {
  try {
    const rateFiling = await RateFiling.findByIdAndDelete(req.params.id);

    if (!rateFiling) {
      return res.status(404).json({
        success: false,
        message: 'Rate filing not found',
      });
    }

    res.json({
      success: true,
      message: 'Rate filing deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get rate filings by user name
// @route   GET /api/rate-filings/user/:name
// @access  Public
const getRateFilingsByUser = async (req, res) => {
  try {
    const rateFilings = await RateFiling.find({
      name: req.params.name,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: rateFilings.length,
      data: rateFilings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get rate filings by shipping line
// @route   GET /api/rate-filings/shipping-line/:line
// @access  Public
const getRateFilingsByShippingLine = async (req, res) => {
  try {
    const rateFilings = await RateFiling.find({
      shipping_lines: req.params.line,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: rateFilings.length,
      data: rateFilings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Search rate filings by POL and POD
// @route   GET /api/rate-filings/search?pol=XXX&pod=XXX
// @access  Public
const searchRateFilings = async (req, res) => {
  try {
    const { pol, pod, shipping_lines, commodity } = req.query;
    const filter = {};

    if (pol) filter.pol = { $regex: pol, $options: 'i' };
    if (pod) filter.pod = { $regex: pod, $options: 'i' };
    if (shipping_lines) filter.shipping_lines = { $regex: shipping_lines, $options: 'i' };
    if (commodity) filter.commodity = { $regex: commodity, $options: 'i' };

    const rateFilings = await RateFiling.find(filter).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: rateFilings.length,
      data: rateFilings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  createRateFiling,
  getAllRateFilings,
  getRateFilingById,
  updateRateFiling,
  deleteRateFiling,
  getRateFilingsByUser,
  getRateFilingsByShippingLine,
  searchRateFilings,
};
