const Destination = require('../models/Destination');
const RateFiling = require('../models/RateFiling');

// ─── Fuzzy matching helpers (used for sync) ──────────────────────────────
const normalizeDestination = (d) => {
  if (!d) return '';
  return String(d)
    .toLowerCase()
    .trim()
    .replace(
      /,?\s*(saudi arabia|argentina|australia|uae|bangladesh|angola|united arab emirates|cameron|china|india|germany|netherlands|belgium|italy|indonesia|ecuador|mexico|colombia|egypt|vietnam|sri lanka|russia|us|israel|france|uk|oman|united kingdom|usa|united states|peru|japan|uruguay|algeria|harbour|harbor|port|ny)$/i,
      ''
    )
    .replace(/^(port of|port|harbor of|harbour of)\s+/i, '')
    .replace(/[,.\-_()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const calculateSimilarity = (a, b) => {
  const A = normalizeDestination(a);
  const B = normalizeDestination(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.9;
  const w1 = new Set(A.split(' ').filter((w) => w.length > 2));
  const w2 = new Set(B.split(' ').filter((w) => w.length > 2));
  if (w1.size === 0 || w2.size === 0) return 0;
  const inter = [...w1].filter((x) => w2.has(x)).length;
  const union = new Set([...w1, ...w2]).size;
  return union ? inter / union : 0;
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeShippingLineEntries = (input) => {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        const name = entry.trim();
        return name ? { lineName: name, isActive: true } : null;
      }
      const name = String(entry.lineName || entry.name || '').trim();
      if (!name) return null;
      return {
        lineName: name,
        isActive: entry.isActive !== false,
      };
    })
    .filter(Boolean);
};

// @desc    Get all destinations
// @route   GET /api/destinations
// @access  Public
const getAllDestinations = async (req, res) => {
  try {
    const destinations = await Destination.find().sort({ destinationName: 1 });
    res.json({ success: true, count: destinations.length, data: destinations });
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
    res.json({ success: true, count: destinations.length, data: destinations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get destination by id
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

// @desc    Create a destination
// @route   POST /api/destinations
// @access  Public
const createDestination = async (req, res) => {
  try {
    const { destinationName, isActive, shippingLines } = req.body || {};
    if (!destinationName || !String(destinationName).trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'destinationName is required' });
    }
    const name = String(destinationName).trim();

    const existing = await Destination.findOne({
      destinationName: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A destination with this name already exists',
        data: existing,
      });
    }

    const destination = await Destination.create({
      destinationName: name,
      isActive: isActive !== false,
      shippingLines: normalizeShippingLineEntries(shippingLines),
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

// @desc    Update a destination (name / isActive only)
// @route   PUT /api/destinations/:id
// @access  Public
const updateDestination = async (req, res) => {
  try {
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }

    if (req.body?.destinationName !== undefined) {
      const name = String(req.body.destinationName).trim();
      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'destinationName cannot be empty',
        });
      }
      destination.destinationName = name;
    }
    if (req.body?.isActive !== undefined) {
      destination.isActive = !!req.body.isActive;
    }

    await destination.save();
    res.json({
      success: true,
      message: 'Destination updated successfully',
      data: destination,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a destination
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

// @desc    Add a shipping line to a destination
// @route   POST /api/destinations/:id/shipping-lines
// @access  Public
const addShippingLine = async (req, res) => {
  try {
    const { lineName, isActive } = req.body || {};
    if (!lineName || !String(lineName).trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'lineName is required' });
    }
    const name = String(lineName).trim();

    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }

    const dup = destination.shippingLines.find(
      (l) => String(l.lineName).toLowerCase() === name.toLowerCase()
    );
    if (dup) {
      return res.status(409).json({
        success: false,
        message: 'Shipping line already exists for this destination',
      });
    }

    destination.shippingLines.push({ lineName: name, isActive: isActive !== false });
    await destination.save();

    res.status(201).json({
      success: true,
      message: 'Shipping line added successfully',
      data: destination,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk add shipping lines (skips duplicates)
// @route   POST /api/destinations/:id/shipping-lines/bulk
// @access  Public
const addBulkShippingLines = async (req, res) => {
  try {
    const incoming = normalizeShippingLineEntries(req.body?.shippingLines);
    if (incoming.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'shippingLines array is required',
      });
    }
    const destination = await Destination.findById(req.params.id);
    if (!destination) {
      return res
        .status(404)
        .json({ success: false, message: 'Destination not found' });
    }

    const existingLower = new Set(
      destination.shippingLines.map((l) =>
        String(l.lineName).toLowerCase().trim()
      )
    );
    const added = [];
    incoming.forEach((entry) => {
      const key = entry.lineName.toLowerCase();
      if (!existingLower.has(key)) {
        destination.shippingLines.push(entry);
        existingLower.add(key);
        added.push(entry.lineName);
      }
    });

    if (added.length > 0) await destination.save();

    res.json({
      success: true,
      message: `${added.length} shipping line${added.length === 1 ? '' : 's'} added`,
      data: { destination, added },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a single shipping line
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
    if (req.body?.lineName !== undefined) {
      const newName = String(req.body.lineName).trim();
      if (!newName) {
        return res
          .status(400)
          .json({ success: false, message: 'lineName cannot be empty' });
      }
      line.lineName = newName;
    }
    if (req.body?.isActive !== undefined) {
      line.isActive = !!req.body.isActive;
    }
    await destination.save();
    res.json({
      success: true,
      message: 'Shipping line updated successfully',
      data: destination,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Remove a shipping line
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
    res.json({ success: true, message: 'Shipping line removed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Sync shipping lines from existing rate filings for a given POD.
//         Creates the destination doc if needed; adds any rate-filing
//         shipping_lines values (exact + fuzzy POD match) not already present.
// @route   POST /api/destinations/sync-from-rates
// @access  Public
const syncShippingLinesFromRates = async (req, res) => {
  try {
    const { destinationName } = req.body || {};
    if (!destinationName || !String(destinationName).trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'destinationName is required' });
    }
    const name = String(destinationName).trim();

    let destination = await Destination.findOne({
      destinationName: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
    });
    let createdDestination = false;
    if (!destination) {
      destination = await Destination.create({
        destinationName: name,
        shippingLines: [],
      });
      createdDestination = true;
    }

    // Find rate-filings whose POD fuzzy-matches this destination
    const allPods = await RateFiling.distinct('pod');
    const matchedPods = allPods.filter(
      (p) => p && calculateSimilarity(name, p) >= 0.6
    );

    let rates = [];
    if (matchedPods.length > 0) {
      rates = await RateFiling.find(
        { pod: { $in: matchedPods } },
        { shipping_lines: 1, _id: 0 }
      ).lean();
    }

    const fromRates = new Set();
    rates.forEach((r) => {
      if (r.shipping_lines) fromRates.add(String(r.shipping_lines).trim());
    });

    const existingLower = new Set(
      (destination.shippingLines || []).map((l) =>
        String(l.lineName || '').toLowerCase().trim()
      )
    );

    const addedNames = [];
    fromRates.forEach((line) => {
      const key = line.toLowerCase();
      if (key && !existingLower.has(key)) {
        destination.shippingLines.push({ lineName: line, isActive: true });
        existingLower.add(key);
        addedNames.push(line);
      }
    });

    if (addedNames.length > 0 || createdDestination) {
      await destination.save();
    }

    res.json({
      success: true,
      message:
        addedNames.length > 0
          ? `Added ${addedNames.length} shipping line${addedNames.length === 1 ? '' : 's'} to ${destination.destinationName}`
          : `No new shipping lines to add for ${destination.destinationName}`,
      data: {
        destination,
        added: addedNames.length,
        addedNames,
        scannedPods: matchedPods,
        scannedRates: rates.length,
        createdDestination,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk upload shipping-line / destination pairs (from Excel)
// @route   POST /api/destinations/bulk-upload
// @access  Public
const bulkUploadExcel = async (req, res) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: '`rows` array is required' });
    }

    // Filter out rows missing either field
    const validRows = rows.filter(
      (r) =>
        r &&
        String(r.shippingLine || '').trim() &&
        String(r.destination || '').trim()
    );
    if (validRows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'No valid rows found. Each row must have "shippingLine" and "destination".',
      });
    }

    // Group lines by destination name (case-insensitive key, preserve first-seen casing)
    const byDest = new Map(); // key: normalised name → { canonical, lines[] }
    validRows.forEach((r) => {
      const dest = String(r.destination).trim();
      const line = String(r.shippingLine).trim();
      const key = dest.toLowerCase();
      if (!byDest.has(key)) byDest.set(key, { canonical: dest, lines: [] });
      byDest.get(key).lines.push(line);
    });

    let totalAdded = 0;
    let totalSkipped = 0;
    const details = [];

    for (const { canonical, lines } of byDest.values()) {
      // Find existing destination (case-insensitive)
      let destination = await Destination.findOne({
        destinationName: {
          $regex: `^${escapeRegex(canonical)}$`,
          $options: 'i',
        },
      });
      let isNew = false;
      if (!destination) {
        destination = await Destination.create({
          destinationName: canonical,
          shippingLines: [],
        });
        isNew = true;
      }

      const existingLower = new Set(
        destination.shippingLines.map((l) =>
          String(l.lineName).toLowerCase().trim()
        )
      );

      const added = [];
      const skipped = [];
      lines.forEach((line) => {
        const key = line.toLowerCase().trim();
        if (!existingLower.has(key)) {
          destination.shippingLines.push({ lineName: line, isActive: true });
          existingLower.add(key);
          added.push(line);
        } else {
          skipped.push(line);
        }
      });

      if (added.length > 0) await destination.save();

      totalAdded += added.length;
      totalSkipped += skipped.length;
      details.push({
        destination: canonical,
        isNew,
        added: added.length,
        skipped: skipped.length,
      });
    }

    res.json({
      success: true,
      message: `Upload complete: ${totalAdded} added, ${totalSkipped} duplicate${totalSkipped !== 1 ? 's' : ''} skipped`,
      data: {
        total: validRows.length,
        added: totalAdded,
        skipped: totalSkipped,
        destinationsProcessed: byDest.size,
        details,
      },
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
  syncShippingLinesFromRates,
  bulkUploadExcel,
};
