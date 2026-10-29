/**
 * Cookie-based server sessions.
 * - Session token: 256-bit random value, stored ONLY as a SHA-256 hash.
 * - Cookie: httpOnly, SameSite=Lax, Secure in production, path=/.
 * - Server-side record allows expiry and revocation (logout / "log out everywhere").
 */
const crypto = require("crypto");
const env = require("../config/env");
const Session = require("../models/Session");

const COOKIE_NAME = "nilaara_sid";
const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");

async function createSession(userId, meta = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  await Session.create({
    tokenHash: hashToken(token),
    user: userId,
    expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * 864e5),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return token;
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_DAYS * 864e5,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: "lax", path: "/" });
}

async function destroySession(token) {
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
}

async function destroyAllSessions(userId) {
  await Session.deleteMany({ user: userId });
}

/** Loads and returns the session doc (user populated) or null. */
async function loadSession(token) {
  if (!token) return null;
  const s = await Session.findOne({ tokenHash: hashToken(token) }).populate("user");
  if (!s) return null;
  if (s.expiresAt < new Date()) {
    await Session.deleteOne({ _id: s._id });
    return null;
  }
  if (!s.user || s.user.status !== "active") return null;
  return s;
}

module.exports = { COOKIE_NAME, createSession, setSessionCookie, clearSessionCookie, destroySession, destroyAllSessions, loadSession, hashToken };
