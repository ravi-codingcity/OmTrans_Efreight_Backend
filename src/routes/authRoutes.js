const express = require('express');
const {
  register,
  login,
  getMe,
  updateProfile,
  adminResetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/admin-reset-password', adminResetPassword);

// Protected routes
router.get('/me', protect, getMe);
router.put('/updateprofile', protect, updateProfile);

module.exports = router;
