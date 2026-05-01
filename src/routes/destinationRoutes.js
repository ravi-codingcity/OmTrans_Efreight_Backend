const express = require('express');
const {
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
} = require('../controllers/destinationController');

const router = express.Router();

// Active destinations — must be before /:id
router.get('/active', getActiveDestinations);

// Destination CRUD
router.get('/', getAllDestinations);
router.post('/', createDestination);
router.get('/:id', getDestinationById);
router.put('/:id', updateDestination);
router.delete('/:id', deleteDestination);

// Nested shipping line operations
router.post('/:id/shipping-lines', addShippingLine);
router.post('/:id/shipping-lines/bulk', addBulkShippingLines);
router.put('/:id/shipping-lines/:shippingLineId', updateShippingLine);
router.delete('/:id/shipping-lines/:shippingLineId', removeShippingLine);

module.exports = router;
