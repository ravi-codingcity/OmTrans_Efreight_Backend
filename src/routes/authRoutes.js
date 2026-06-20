const express = require('express');
const {
  register,
  login,
  getMe,
  updateProfile,
  adminResetPassword,
  updatePreferences,
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
router.patch('/preferences', protect, updatePreferences);

module.exports = router;
