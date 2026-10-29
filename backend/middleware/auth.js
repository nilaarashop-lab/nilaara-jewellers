/**
 * Authentication & authorization middleware.
 * Sessions are cookie-based and resolved server-side (see lib/session.js).
 * Public registration can only ever create "customer" accounts.
 */
const { asyncHandler, fail } = require("../lib/apiError");
const { COOKIE_NAME, loadSession } = require("../lib/session");

/** Loads req.user/req.session when a session cookie is present. Never rejects. */
const attachUser = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    const session = await loadSession(token);
    if (session) {
      req.session = session;
      req.user = session.user;
    }
  }
  next();
});

/** Requires any authenticated, active user. */
const requireUser = asyncHandler(async (req, _res, next) => {
  if (!req.user) fail(401, "Please log in to continue.");
  next();
});

/** Requires one of the given roles: requireRole("admin") / requireRole("admin","staff"). */
const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(Object.assign(new Error("Please log in to continue."), { status: 401 }));
    if (!roles.includes(req.user.role)) {
      return next(Object.assign(new Error("You do not have permission to perform this action."), { status: 403 }));
    }
    next();
  };

module.exports = { attachUser, requireUser, requireRole };
