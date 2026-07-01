const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Please provide a username'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      select: false,
    },
    fullName: {
      type: String,
      required: [true, 'Please provide full name'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['Super Admin', 'Admin', 'Manager', 'User', 'Viewer', 'Import', 'Export', 'Agent'],
      default: 'User',
    },
    location: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Export-AI module: per-user preferred Gemini model (optional, additive).
    preferredAiModel: {
      type: String,
      default: 'gemini-2.5-flash',
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving.
// IMPORTANT: only (re)hash when the password was actually set/changed. Without the
// early `return`, every save that does NOT touch the password (e.g. profile or
// preference updates) would re-hash the already-hashed value and permanently break
// login — that was the root cause of the "Invalid username or password" failures.
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

// Method to compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
