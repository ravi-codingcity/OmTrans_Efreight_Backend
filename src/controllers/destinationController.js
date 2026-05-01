const Destination = require('../models/Destination');

// @desc    Get all destinations
// @route   GET /api/destinations
// @access  Public
const getAllDestinations = async (req, res) => {
  try {
    const destinations = await Destination.find().sort({ destinationName: 1 });
    res.json({
      success: true,
      count: destinations.length,
      data: destinations,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get only active destinations
// @route   GET /api/destinations/active
// @access  Public
const getActiveDestinations = async (req, res) => {
  try {
    const destinations = await Destination.find({ isActive: true }).sort({
      destinationName: 1,
    });
    res.json({
      success: true,
      count: destinations.length,
      data: destinations,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single destination by ID
// @route   GET /api/destinations/:id
// @access  Public
const getDestinationById = async (req, res) => {
  try {
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }
    res.json({ success: true, data: destination });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create destination (optionally with initial shipping lines)
// @route   POST /api/destinations
// @access  Public
const createDestination = async (req, res) => {
  try {
    const { destinationName, shippingLines = [], isActive } = req.body;

    if (!destinationName || !destinationName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Destination name is required',
      });
    }

    const trimmedName = destinationName.trim();

    // Prevent case-insensitive duplicates
    const existing = await Destination.findOne({
      destinationName: { $regex: `^${trimmedName}$`, $options: 'i' },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A destination with this name already exists',
        data: existing,
      });
    }

    // Normalize shippingLines into [{lineName, isActive}]
    const normalizedLines = (Array.isArray(shippingLines) ? shippingLines : [])
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim() ? { lineName: item.trim() } : null;
        }
        if (item && typeof item === 'object' && item.lineName) {
          return {
            lineName: String(item.lineName).trim(),
            isActive: item.isActive !== false,
          };
        }
        return null;
      })
      .filter(Boolean);

    const destination = await Destination.create({
      destinationName: trimmedName,
      isActive: isActive !== false,
      shippingLines: normalizedLines,
    });

    res.status(201).json({
      success: true,
      message: 'Destination created successfully',
      data: destination,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update destination
// @route   PUT /api/destinations/:id
// @access  Public
const updateDestination = async (req, res) => {
  try {
    const update = {};
    if (typeof req.body.destinationName === 'string') {
      update.destinationName = req.body.destinationName.trim();
    }
    if (typeof req.body.isActive === 'boolean') {
      update.isActive = req.body.isActive;
    }

    const destination = await Destination.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );

    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }

    res.json({
      success: true,
      message: 'Destination updated successfully',
      data: destination,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete destination
// @route   DELETE /api/destinations/:id
// @access  Public
const deleteDestination = async (req, res) => {
  try {
    const destination = await Destination.findByIdAndDelete(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }
    res.json({ success: true, message: 'Destination deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add a single shipping line to a destination
// @route   POST /api/destinations/:id/shipping-lines
// @access  Public
const addShippingLine = async (req, res) => {
  try {
    const { lineName } = req.body;
    if (!lineName || !String(lineName).trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Shipping line name is required' });
    }

    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }

    const trimmed = String(lineName).trim();
    const exists = destination.shippingLines.some(
      (l) => l.lineName.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Shipping line already exists for this destination',
      });
    }

    destination.shippingLines.push({ lineName: trimmed });
    await destination.save();

    const added = destination.shippingLines[destination.shippingLines.length - 1];
    res.status(201).json({
      success: true,
      message: 'Shipping line added successfully',
      data: added,
      destination,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add multiple shipping lines at once
// @route   POST /api/destinations/:id/shipping-lines/bulk
// @access  Public
const addBulkShippingLines = async (req, res) => {
  try {
    const { lineNames } = req.body;
    if (!Array.isArray(lineNames) || lineNames.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'lineNames must be a non-empty array',
      });
    }

    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }

    const existingLower = new Set(
      destination.shippingLines.map((l) => l.lineName.toLowerCase())
    );
    const added = [];
    lineNames.forEach((raw) => {
      if (typeof raw !== 'string') return;
      const name = raw.trim();
      if (!name) return;
      if (existingLower.has(name.toLowerCase())) return;
      destination.shippingLines.push({ lineName: name });
      existingLower.add(name.toLowerCase());
      added.push(name);
    });

    await destination.save();

    res.status(201).json({
      success: true,
      message: `${added.length} shipping line(s) added`,
      data: destination.shippingLines,
      added,
      destination,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a shipping line on a destination
// @route   PUT /api/destinations/:id/shipping-lines/:shippingLineId
// @access  Public
const updateShippingLine = async (req, res) => {
  try {
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }

    const line = destination.shippingLines.id(req.params.shippingLineId);
    if (!line) {
      return res
        .status(404)
        .json({ success: false, message: 'Shipping line not found' });
    }

    if (typeof req.body.lineName === 'string') {
      line.lineName = req.body.lineName.trim();
    }
    if (typeof req.body.isActive === 'boolean') {
      line.isActive = req.body.isActive;
    }

    await destination.save();

    res.json({
      success: true,
      message: 'Shipping line updated successfully',
      data: line,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Remove a shipping line from a destination
// @route   DELETE /api/destinations/:id/shipping-lines/:shippingLineId
// @access  Public
const removeShippingLine = async (req, res) => {
  try {
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }

    const line = destination.shippingLines.id(req.params.shippingLineId);
    if (!line) {
      return res
        .status(404)
        .json({ success: false, message: 'Shipping line not found' });
    }

    line.deleteOne();
    await destination.save();

    res.json({
      success: true,
      message: 'Shipping line removed successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllDestinations,
  getActiveDestinations,
  getDestinationById,
  createDestination,
  updateDestination,
  deleteDestination,
  addShippingLine,
  addBulkShippingLines,
  updateShippingLine,
  removeShippingLine,
};
