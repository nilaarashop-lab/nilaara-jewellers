/**
 * CSRF protection for cookie-authenticated state-changing requests.
 *
 * Strategy (defence in depth, no tokens needed for the frontend):
 *  1. Session cookies are SameSite=Lax → browsers already withhold them on
 *     cross-site POST/PUT/PATCH/DELETE.
 *  2. When a browser DOES send an Origin header (all cross-origin fetches do),
 *     it must match the configured frontend origin(s) or the request origin.
 *     Anything else is rejected with 403.
 *  3. Requests without an Origin header (server-to-server, curl, mobile apps)
 *     pass — they cannot carry a victim's browser cookies.
 */
const env = require("../config/env");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const allowedOrigins = () =>
  env.FRONTEND_URL.split(",").map((s) => s.trim()).filter(Boolean).concat(env.PUBLIC_BASE_URL ? [env.PUBLIC_BASE_URL] : []);

function sameOrigin(origin, req) {
  try {
    const u = new URL(origin);
    return u.host === req.headers.host; // same host (scheme-agnostic: proxy may terminate TLS)
  } catch {
    return false;
  }
}

function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next(); // non-browser client — no ambient cookies to abuse
  const allowed = allowedOrigins();
  if (sameOrigin(origin, req) || allowed.some((o) => o.replace(/\/$/, "") === origin)) return next();
  return res.status(403).json({ error: "Request blocked: unrecognised origin." });
}

module.exports = { csrfGuard };
