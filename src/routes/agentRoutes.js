const express = require('express');
const {
  uploadAgents,
  createAgent,
  getAllAgents,
  getAgentById,
  updateAgent,
  deleteAgent,
  getAgentsByCountry,
  searchAgents,
} = require('../controllers/agentController');

const router = express.Router();

// Upload & filter routes — MUST be before /:id
router.post('/upload', uploadAgents);
router.get('/search', searchAgents);
router.get('/country/:country', getAgentsByCountry);

// Main CRUD routes
router.post('/', createAgent);
router.get('/', getAllAgents);
router.get('/:id', getAgentById);
router.put('/:id', updateAgent);
router.delete('/:id', deleteAgent);

module.exports = router;
