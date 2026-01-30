const express = require('express');
const {
  createQuotation,
  getAllQuotations,
  getQuotationById,
  updateQuotation,
  deleteQuotation,
  getQuotationsBySegment,
  getQuotationsByUser,
} = require('../controllers/quotationController');

const router = express.Router();

// Filter routes - MUST be before /:id to avoid conflicts
router.get('/segment/:segment', getQuotationsBySegment);
router.get('/user/:username', getQuotationsByUser);

// Main CRUD routes
router.post('/', createQuotation);
router.get('/', getAllQuotations);
router.get('/:id', getQuotationById);
router.put('/:id', updateQuotation);
router.delete('/:id', deleteQuotation);

module.exports = router;
