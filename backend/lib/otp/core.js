/**
 * Pure OTP helpers — no I/O, no provider calls, fully unit-testable.
 *
 * Rules enforced here:
 *  - Phone numbers are normalized to a 10-digit Indian mobile (no +91, no 0 prefix).
 *  - Codes are generated with crypto.randomInt (CSPRNG, uniform digits).
 *  - Codes are stored only as HMAC-SHA256(phone + purpose + code) — plaintext
 *    never touches the database, logs, or API responses.
 *  - Verification uses timing-safe comparison.
 */
const crypto = require("crypto");
const env = require("../../config/env");

const PURPOSE = "login"; // phone OTP purpose ("email" is used for email OTP)

/**
 * Normalizes user input to a 10-digit Indian mobile number.
 * Accepts: "9876543210", "+91 98765 43210", "09876543210", "91-98765-43210", "tel:+919876543210".
 * Returns the 10-digit string, or null when the input is not a plausible Indian mobile.
 */
function normalizePhone(input) {
  if (typeof input !== "string") return null;
  let d = input.replace(/[^0-9+]/g, ""); // strip spaces, dashes, brackets
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("0091")) d = d.slice(4);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9][0-9]{9}$/.test(d)) return null; // Indian mobiles start 6–9
  return d;
}

/** CSPRNG OTP: e.g. 6 digits, no leading-zero bias issues (000000 is valid but ~1e-6). */
function generateCode(len = env.OTP_LEN) {
  const n = Math.max(4, Math.min(10, Number(len) || 6));
  return crypto.randomInt(0, 10 ** n).toString().padStart(n, "0");
}

/**
 * HMAC-SHA256 keyed by OTP_HASH_SECRET, bound to identifier + purpose.
 * The purpose ("login" for phone SMS, "email" for email OTP) binds the hash so
 * a code issued for one channel can never verify on another.
 */
function hashOtp(identifier, code, purpose = PURPOSE) {
  return crypto.createHmac("sha256", env.OTP_HASH_SECRET).update(`${purpose}:${identifier}:${code}`).digest("hex");
}

/** Constant-time verification of a submitted code against a stored challenge. */
function verifyOtpHash(identifier, code, storedHash, purpose = PURPOSE) {
  if (typeof code !== "string" || !/^[0-9]{4,10}$/.test(code)) return false;
  const candidate = Buffer.from(hashOtp(identifier, code, purpose), "hex");
  const stored = Buffer.from(String(storedHash || ""), "hex");
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

const isExpired = (challenge, now = Date.now()) => !challenge || new Date(challenge.expiresAt).getTime() <= now;

const attemptsExhausted = (challenge, max = env.OTP_MAX_ATTEMPTS) => !challenge || challenge.attempts >= max;

/** +91 98765••••• — shown in the UI so users confirm the number without re-exposing it. */
function maskPhone(phone) {
  const p = String(phone || "");
  return p.length === 10 ? `+91 ${p.slice(0, 5)}•••••` : "•••";
}

/** a***@gmail.com — same idea for email addresses. */
function maskEmail(email) {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}***@${domain}`;
}

module.exports = { PURPOSE, normalizePhone, generateCode, hashOtp, verifyOtpHash, isExpired, attemptsExhausted, maskPhone, maskEmail };
