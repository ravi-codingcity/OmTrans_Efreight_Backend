const Agent = require('../models/Agent');
const multer = require('multer');
const XLSX = require('xlsx');

// Multer config — store in memory (no disk files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xls, .xlsx) are allowed'));
    }
  },
});

// Map Excel header → schema field
const HEADER_MAP = {
  'country': 'country',
  'company name': 'companyName',
  'company address': 'companyAddress',
  'contact person name': 'contactPersonName',
  'person designation': 'personDesignation',
  'contact number': 'contactNumber',
  'contact number (mobile / landline)': 'contactNumber',
  'landline number': 'landlineNumber',
  'landline number (landline)': 'landlineNumber',
  'email': 'personEmail',
  'person email': 'personEmail',
  'remarks': 'remarks',
};

const normalizeHeader = (h) => String(h).trim().toLowerCase();

// @desc    Upload Excel and bulk-insert agents
// @route   POST /api/agents/upload
// @access  Admin
const uploadAgents = [
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please upload an Excel file',
        });
      }

      // Parse workbook from buffer
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({
          success: false,
          message: 'Excel file has no sheets',
        });
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: '',
      });

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Excel file is empty',
        });
      }

      // Map rows to agent documents
      const agents = [];
      const errors = [];

      rows.forEach((row, idx) => {
        const doc = {};
        Object.keys(row).forEach((key) => {
          const mapped = HEADER_MAP[normalizeHeader(key)];
          if (mapped) {
            doc[mapped] = String(row[key]).trim();
          }
        });

        if (!doc.companyName) {
          errors.push(`Row ${idx + 2}: Company Name is missing`);
          return;
        }
        agents.push(doc);
      });

      if (agents.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid rows found',
          errors,
        });
      }

      const inserted = await Agent.insertMany(agents, { ordered: false });

      res.status(201).json({
        success: true,
        message: `${inserted.length} agents uploaded successfully`,
        insertedCount: inserted.length,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
];

// @desc    Add agent manually
// @route   POST /api/agents
// @access  Public
const createAgent = async (req, res) => {
  try {
    const data = req.body;

    if (!data.companyName) {
      return res.status(400).json({
        success: false,
        message: 'Company name is required',
      });
    }

    const agent = await Agent.create(data);

    res.status(201).json({
      success: true,
      message: 'Agent created successfully',
      data: agent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all agents
// @route   GET /api/agents
// @access  Public
const getAllAgents = async (req, res) => {
  try {
    const agents = await Agent.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      count: agents.length,
      data: agents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single agent by ID
// @route   GET /api/agents/:id
// @access  Public
const getAgentById = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
      });
    }

    res.json({
      success: true,
      data: agent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update agent
// @route   PUT /api/agents/:id
// @access  Public
const updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
      });
    }

    res.json({
      success: true,
      message: 'Agent updated successfully',
      data: agent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete agent
// @route   DELETE /api/agents/:id
// @access  Public
const deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findByIdAndDelete(req.params.id);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
      });
    }

    res.json({
      success: true,
      message: 'Agent deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get agents by country
// @route   GET /api/agents/country/:country
// @access  Public
const getAgentsByCountry = async (req, res) => {
  try {
    const agents = await Agent.find({
      country: { $regex: req.params.country, $options: 'i' },
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: agents.length,
      data: agents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Search agents
// @route   GET /api/agents/search?country=&companyName=&contactPersonName=
// @access  Public
const searchAgents = async (req, res) => {
  try {
    const { country, companyName, contactPersonName } = req.query;
    const filter = {};

    if (country) filter.country = { $regex: country, $options: 'i' };
    if (companyName) filter.companyName = { $regex: companyName, $options: 'i' };
    if (contactPersonName) filter.contactPersonName = { $regex: contactPersonName, $options: 'i' };

    const agents = await Agent.find(filter).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: agents.length,
      data: agents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  uploadAgents,
  createAgent,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  getAgentsByCountry,
  searchAgents,
};
