const MawbImport = require("../models/MawbImport");
const { validateMawb } = require("../validation/mawbValidation");
const {
  sanitizeMawbPayload,
  buildDocumentModel,
  renderMawbHtml,
} = require("../services/mawbDocumentService");
const { isSuperAdmin } = require("../middleware/importAuth");

const normalize = (s) => (s || "").toString().trim().toLowerCase();

// Records a non Super-Admin user is allowed to see/act on (their own).
const ownershipFilter = (req) => {
  if (isSuperAdmin(req)) return {};
  const u = req.importUser || {};
  const names = [u.fullName, u.username].filter(Boolean).map(normalize);
  if (names.length === 0) return { _id: null }; // match nothing
  return { createdBy: { $in: names.map((n) => new RegExp(`^${escapeRegExp(n)}$`, "i")) } };
};

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const canAccessRecord = (req, record) => {
  if (isSuperAdmin(req)) return true;
  const u = req.importUser || {};
  const owner = normalize(record.createdBy);
  return owner && (owner === normalize(u.fullName) || owner === normalize(u.username));
};

// @desc    Create a MAWB record (draft or submitted)
// @route   POST /api/import/mawb
// @access  Import, Super Admin
const createMawb = async (req, res) => {
  try {
    const { valid, errors } = validateMawb(req.body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }
    const payload = sanitizeMawbPayload(req.body, req.importUser);
    const record = await MawbImport.create(payload);
    res.status(201).json({
      success: true,
      message:
        payload.status === "submitted"
          ? "MAWB submitted successfully"
          : "MAWB draft saved successfully",
      data: record,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all MAWB records (scoped by ownership unless Super Admin)
// @route   GET /api/import/mawb
// @access  Import, Super Admin
const getAllMawb = async (req, res) => {
  try {
    const filter = ownershipFilter(req);
    if (req.query.status === "draft" || req.query.status === "submitted") {
      filter.status = req.query.status;
    }
    const records = await MawbImport.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get a single MAWB record
// @route   GET /api/import/mawb/:id
// @access  Import (own), Super Admin (any)
const getMawbById = async (req, res) => {
  try {
    const record = await MawbImport.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: "MAWB record not found" });
    }
    if (!canAccessRecord(req, record)) {
      return res.status(403).json({ success: false, message: "Not authorized to view this record" });
    }
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update a MAWB record
// @route   PUT /api/import/mawb/:id
// @access  Import (own), Super Admin (any)
const updateMawb = async (req, res) => {
  try {
    const existing = await MawbImport.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "MAWB record not found" });
    }
    if (!canAccessRecord(req, existing)) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this record" });
    }
    const { valid, errors } = validateMawb(req.body);
    if (!valid) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }
    const payload = sanitizeMawbPayload(req.body, req.importUser);
    // Preserve original authorship metadata.
    payload.createdBy = existing.createdBy || payload.createdBy;
    payload.createdByRole = existing.createdByRole || payload.createdByRole;
    payload.createdByLocation = existing.createdByLocation || payload.createdByLocation;

    const record = await MawbImport.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, message: "MAWB updated successfully", data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a MAWB record
// @route   DELETE /api/import/mawb/:id
// @access  Super Admin only
const deleteMawb = async (req, res) => {
  try {
    const record = await MawbImport.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: "MAWB record not found" });
    }
    res.json({ success: true, message: "MAWB deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Generate the MAWB document model (mapped, ready for rendering)
// @route   GET /api/import/mawb/:id/document
// @access  Import (own), Super Admin (any)
const generateMawbDocument = async (req, res) => {
  try {
    const record = await MawbImport.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: "MAWB record not found" });
    }
    if (!canAccessRecord(req, record)) {
      return res.status(403).json({ success: false, message: "Not authorized to access this record" });
    }
    res.json({ success: true, data: buildDocumentModel(record) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Download the MAWB document as a Word-compatible .doc file
// @route   GET /api/import/mawb/:id/download
// @access  Import (own), Super Admin (any)
const downloadMawbDocument = async (req, res) => {
  try {
    const record = await MawbImport.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: "MAWB record not found" });
    }
    if (!canAccessRecord(req, record)) {
      return res.status(403).json({ success: false, message: "Not authorized to access this record" });
    }
    const html = renderMawbHtml(record);
    const ref = record.hawb_nos || record._id;
    const fileName = `AWB-Instruction-${String(ref).replace(/[^\w-]+/g, "_")}.doc`;
    res.setHeader("Content-Type", "application/msword");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(html);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createMawb,
  getAllMawb,
  getMawbById,
  updateMawb,
  deleteMawb,
  generateMawbDocument,
  downloadMawbDocument,
};
