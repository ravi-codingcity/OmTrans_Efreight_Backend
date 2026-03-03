const express = require('express');
const {
  createRateFiling,
  getAllRateFilings,
  getRateFilingById,
  updateRateFiling,
  deleteRateFiling,
  getRateFilingsByUser,
  getRateFilingsByShippingLine,
  searchRateFilings,
} = require('../controllers/rateFilingController');

const router = express.Router();

// Filter & search routes — MUST be before /:id to avoid conflicts
router.get('/search', searchRateFilings);
router.get('/user/:name', getRateFilingsByUser);
router.get('/shipping-line/:line', getRateFilingsByShippingLine);

// Main CRUD routes
router.post('/', createRateFiling);
router.get('/', getAllRateFilings);
router.get('/:id', getRateFilingById);
router.put('/:id', updateRateFiling);
router.delete('/:id', deleteRateFiling);

module.exports = router;
