const HawbImport = require("../models/HawbImport");
const { validateHawb } = require("../validation/hawbValidation");
const {
  sanitizeHawbPayload,
  buildDocumentModel,
} = require("../services/hawbDocumentService");
const { isSuperAdmin } = require("../../middleware/importAuth");

const normalize = (s) => (s || "").toString().trim().toLowerCase();
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ownershipFilter = (req) => {
  if (isSuperAdmin(req)) return {};
  const u = req.importUser || {};
  const names = [u.fullName, u.username].filter(Boolean).map(normalize);
  if (names.length === 0) return { _id: null };
  return { createdBy: { $in: names.map((n) => new RegExp(`^${escapeRegExp(n)}$`, "i")) } };
};

const canAccessRecord = (req, record) => {
  if (isSuperAdmin(req)) return true;
  const u = req.importUser || {};
  const owner = normalize(record.createdBy);
  return owner && (owner === normalize(u.fullName) || owner === normalize(u.username));
};

// @desc Create a HAWB record (draft or submitted)
// @route POST /api/import/hawb
const createHawb = async (req, res) => {
  try {
    const { valid, errors } = validateHawb(req.body);
    if (!valid) return res.status(400).json({ success: false, message: errors[0], errors });
    const record = await HawbImport.create(sanitizeHawbPayload(req.body, req.importUser));
    res.status(201).json({
      success: true,
      message: record.status === "submitted" ? "HAWB submitted successfully" : "HAWB draft saved successfully",
      data: record,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Get all HAWB records (scoped unless Super Admin)
// @route GET /api/import/hawb
const getAllHawb = async (req, res) => {
  try {
    const filter = ownershipFilter(req);
    if (req.query.status === "draft" || req.query.status === "submitted") filter.status = req.query.status;
    const records = await HawbImport.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Get a single HAWB record
// @route GET /api/import/hawb/:id
const getHawbById = async (req, res) => {
  try {
    const record = await HawbImport.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "HAWB record not found" });
    if (!canAccessRecord(req, record)) return res.status(403).json({ success: false, message: "Not authorized to view this record" });
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Update a HAWB record
// @route PUT /api/import/hawb/:id
const updateHawb = async (req, res) => {
  try {
    const existing = await HawbImport.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "HAWB record not found" });
    if (!canAccessRecord(req, existing)) return res.status(403).json({ success: false, message: "Not authorized to edit this record" });
    const { valid, errors } = validateHawb(req.body);
    if (!valid) return res.status(400).json({ success: false, message: errors[0], errors });
    const payload = sanitizeHawbPayload(req.body, req.importUser);
    payload.createdBy = existing.createdBy || payload.createdBy;
    payload.createdByRole = existing.createdByRole || payload.createdByRole;
    payload.createdByLocation = existing.createdByLocation || payload.createdByLocation;
    const record = await HawbImport.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    res.json({ success: true, message: "HAWB updated successfully", data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Delete a HAWB record
// @route DELETE /api/import/hawb/:id  (Super Admin only)
const deleteHawb = async (req, res) => {
  try {
    const record = await HawbImport.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "HAWB record not found" });
    res.json({ success: true, message: "HAWB deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Generate the HAWB document model (mapped + nature combined)
// @route GET /api/import/hawb/:id/document
const generateHawbDocument = async (req, res) => {
  try {
    const record = await HawbImport.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: "HAWB record not found" });
    if (!canAccessRecord(req, record)) return res.status(403).json({ success: false, message: "Not authorized to access this record" });
    res.json({ success: true, data: buildDocumentModel(record) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createHawb,
  getAllHawb,
  getHawbById,
  updateHawb,
  deleteHawb,
  generateHawbDocument,
};
