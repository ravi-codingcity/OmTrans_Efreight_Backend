const express = require('express');
const {
  createPreAdvice,
  getAllPreAdvice,
  getPreAdviceById,
  getPreAdviceByJobNo,
  updatePreAdvice,
  deletePreAdvice,
  getPreAdviceByUser,
  getPreAdviceByCustomer,
} = require('../controllers/preAdviceController');

const router = express.Router();

// Filter routes — MUST be before /:id to avoid conflicts
router.get('/job/:jobNo', getPreAdviceByJobNo);
router.get('/user/:username', getPreAdviceByUser);
router.get('/customer/:name', getPreAdviceByCustomer);

// Main CRUD routes
router.post('/', createPreAdvice);
router.get('/', getAllPreAdvice);
router.get('/:id', getPreAdviceById);
router.put('/:id', updatePreAdvice);
router.delete('/:id', deletePreAdvice);

module.exports = router;
