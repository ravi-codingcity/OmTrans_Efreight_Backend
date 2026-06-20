/* ------------------------------------------------------------------ */
/*  Auth bridge — REUSES the existing app authentication.             */
/*  No new auth system: `authenticate` is the existing `protect`       */
/*  middleware (verifies the existing single JWT and loads the         */
/*  existing User into req.user). `requireAdmin` maps the AI module's  */
/*  "admin" concept onto the existing role enum.                       */
/* ------------------------------------------------------------------ */
const { protect } = require("../../../middleware/auth");
const { ApiError } = require("../utils/ApiError");

const authenticate = protect;

const isAdminRole = (role) => {
  const r = String(role || "").toLowerCase().trim();
  return r === "super admin" || r === "admin";
};

const requireAdmin = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!isAdminRole(req.user.role)) return next(ApiError.forbidden("Insufficient permissions for this action"));
  next();
};

module.exports = { authenticate, requireAdmin, isAdminRole };
