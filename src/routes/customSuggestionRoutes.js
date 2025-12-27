const express = require('express');
const {
  getAllSuggestions,
  getSuggestionsByType,
  createSuggestion,
  createBatchSuggestions,
  deleteSuggestion,
} = require('../controllers/customSuggestionController');

const router = express.Router();

// Get all suggestions grouped by type
router.get('/', getAllSuggestions);

// Batch create - must be before :type route
router.post('/batch', createBatchSuggestions);

// Get suggestions by type
router.get('/:type', getSuggestionsByType);

// Create single suggestion
router.post('/', createSuggestion);

// Delete suggestion by type and id
router.delete('/:type/:id', deleteSuggestion);

module.exports = router;
