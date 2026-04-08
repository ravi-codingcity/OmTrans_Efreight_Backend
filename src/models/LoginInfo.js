const mongoose = require("mongoose");

const loginInfoSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
    },
    fullName: {
      type: String,
      default: "",
      trim: true,
    },
    role: {
      type: String,
      default: "User",
      trim: true,
    },
    loginAt: {
      type: Date,
      default: Date.now,
    },
    logoutAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
loginInfoSchema.index({ loginAt: -1 });
loginInfoSchema.index({ username: 1 });

module.exports = mongoose.model("LoginInfo", loginInfoSchema);
