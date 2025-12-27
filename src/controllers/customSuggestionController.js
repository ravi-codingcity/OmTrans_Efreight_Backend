const CustomSuggestion = require('../models/CustomSuggestion');

// Valid types for validation
const VALID_TYPES = ['customer', 'consignee', 'pod', 'pol', 'por', 'airportDeparture', 'airportDestination'];
const SIMPLE_TYPES = ['pod', 'pol', 'por', 'airportDeparture', 'airportDestination'];
const COMPLEX_TYPES = ['customer', 'consignee'];

// @desc    Get all custom suggestions grouped by type
// @route   GET /api/custom-suggestions
// @access  Public
const getAllSuggestions = async (req, res) => {
  try {
    const suggestions = await CustomSuggestion.find().sort({ createdAt: -1 });

    // Group suggestions by type
    const grouped = {
      customer: [],
      consignee: [],
      pod: [],
      pol: [],
      por: [],
      airportDeparture: [],
      airportDestination: [],
    };

    suggestions.forEach((item) => {
      if (COMPLEX_TYPES.includes(item.type)) {
        grouped[item.type].push({
          _id: item._id,
          name: item.name,
          address: item.address,
        });
      } else {
        grouped[item.type].push({
          _id: item._id,
          value: item.value,
        });
      }
    });

    res.json({
      success: true,
      suggestions: grouped,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get suggestions by type
// @route   GET /api/custom-suggestions/:type
// @access  Public
const getSuggestionsByType = async (req, res) => {
  try {
    const { type } = req.params;

    // Validate type
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    const suggestions = await CustomSuggestion.find({ type }).sort({ createdAt: -1 });

    // Format response based on type
    let formattedSuggestions;
    if (COMPLEX_TYPES.includes(type)) {
      formattedSuggestions = suggestions.map((item) => ({
        _id: item._id,
        name: item.name,
        address: item.address,
      }));
    } else {
      formattedSuggestions = suggestions.map((item) => ({
        _id: item._id,
        value: item.value,
      }));
    }

    res.json({
      success: true,
      type,
      count: formattedSuggestions.length,
      suggestions: formattedSuggestions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Save a single custom suggestion
// @route   POST /api/custom-suggestions
// @access  Public
const createSuggestion = async (req, res) => {
  try {
    const { type, value, createdBy } = req.body;

    // Validate type
    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    // Validate value
    if (!value) {
      return res.status(400).json({
        success: false,
        message: 'Value is required',
      });
    }

    let suggestionData = { type, createdBy: createdBy || '' };

    // Handle complex types (customer/consignee)
    if (COMPLEX_TYPES.includes(type)) {
      if (typeof value !== 'object' || !value.name) {
        return res.status(400).json({
          success: false,
          message: 'For customer/consignee, value must be an object with name and address',
        });
      }
      suggestionData.name = value.name.trim();
      suggestionData.address = value.address ? value.address.trim() : '';
    } else {
      // Handle simple types
      if (typeof value !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'For this type, value must be a string',
        });
      }
      suggestionData.value = value.trim();
    }

    // Check for duplicates
    let existingQuery;
    if (COMPLEX_TYPES.includes(type)) {
      existingQuery = { type, name: suggestionData.name };
    } else {
      existingQuery = { type, value: suggestionData.value };
    }

    const existing = await CustomSuggestion.findOne(existingQuery);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'This suggestion already exists',
      });
    }

    const suggestion = await CustomSuggestion.create(suggestionData);

    res.status(201).json({
      success: true,
      message: 'Suggestion saved successfully',
      data: suggestion,
    });
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This suggestion already exists',
      });
    }
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Save multiple suggestions at once
// @route   POST /api/custom-suggestions/batch
// @access  Public
const createBatchSuggestions = async (req, res) => {
  try {
    const { suggestions, createdBy } = req.body;

    if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Suggestions array is required',
      });
    }

    let saved = 0;
    let failed = 0;
    const errors = [];
    const savedItems = [];

    for (const item of suggestions) {
      try {
        const { type, value } = item;

        // Validate type
        if (!type || !VALID_TYPES.includes(type)) {
          failed++;
          errors.push({ item, error: 'Invalid type' });
          continue;
        }

        // Validate value
        if (!value) {
          failed++;
          errors.push({ item, error: 'Value is required' });
          continue;
        }

        let suggestionData = { type, createdBy: createdBy || '' };

        // Handle complex types
        if (COMPLEX_TYPES.includes(type)) {
          if (typeof value !== 'object' || !value.name) {
            failed++;
            errors.push({ item, error: 'Invalid value format for customer/consignee' });
            continue;
          }
          suggestionData.name = value.name.trim();
          suggestionData.address = value.address ? value.address.trim() : '';

          // Check duplicate
          const existing = await CustomSuggestion.findOne({ type, name: suggestionData.name });
          if (existing) {
            failed++;
            errors.push({ item, error: 'Duplicate entry' });
            continue;
          }
        } else {
          // Handle simple types
          if (typeof value !== 'string') {
            failed++;
            errors.push({ item, error: 'Value must be a string' });
            continue;
          }
          suggestionData.value = value.trim();

          // Check duplicate
          const existing = await CustomSuggestion.findOne({ type, value: suggestionData.value });
          if (existing) {
            failed++;
            errors.push({ item, error: 'Duplicate entry' });
            continue;
          }
        }

        const suggestion = await CustomSuggestion.create(suggestionData);
        savedItems.push(suggestion);
        saved++;
      } catch (err) {
        failed++;
        errors.push({ item, error: err.message });
      }
    }

    res.status(201).json({
      success: true,
      message: `Batch processing complete`,
      saved,
      failed,
      total: suggestions.length,
      savedItems,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete a custom suggestion
// @route   DELETE /api/custom-suggestions/:type/:id
// @access  Public
const deleteSuggestion = async (req, res) => {
  try {
    const { type, id } = req.params;

    // Validate type
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }

    const suggestion = await CustomSuggestion.findOneAndDelete({ _id: id, type });

    if (!suggestion) {
      return res.status(404).json({
        success: false,
        message: 'Suggestion not found',
      });
    }

    res.json({
      success: true,
      message: 'Suggestion deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getAllSuggestions,
  getSuggestionsByType,
  createSuggestion,
  createBatchSuggestions,
  deleteSuggestion,
};
