const jwt = require("jsonwebtoken");
const User = require("../../../models/User");

/* ------------------------------------------------------------------ */
/*  Import-module authorization middleware                            */
/*                                                                    */
/*  Self-contained so the Import module stays isolated. Verifies the  */
/*  JWT (same secret the auth module issues) and enforces role-based  */
/*  access:                                                           */
/*    - importAccess : Super Admin OR Import role                     */
/*    - superAdminOnly: Super Admin only (used for delete)            */
/* ------------------------------------------------------------------ */

const normalizeRole = (role) => (role || "").toString().trim().toLowerCase();

// Attach the authenticated user (from Bearer token) to req.importUser.
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided",
      });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    if (!user.isActive) {
      return res
        .status(401)
        .json({ success: false, message: "User account is inactive" });
    }

    req.importUser = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, token failed",
    });
  }
};

// Allow Super Admin or Import role.
const importAccess = (req, res, next) => {
  const role = normalizeRole(req.importUser && req.importUser.role);
  if (role === "super admin" || role === "import") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Not authorized to access the Import module",
  });
};

// Restrict to Super Admin only (e.g. delete).
const superAdminOnly = (req, res, next) => {
  const role = normalizeRole(req.importUser && req.importUser.role);
  if (role === "super admin") {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Only Super Admin can perform this action",
  });
};

// Whether the current request user is a Super Admin (for ownership scoping).
const isSuperAdmin = (req) =>
  normalizeRole(req.importUser && req.importUser.role) === "super admin";

module.exports = { authenticate, importAccess, superAdminOnly, isSuperAdmin };
