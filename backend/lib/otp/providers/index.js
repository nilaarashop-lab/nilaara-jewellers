/**
 * OTP provider selector.
 * The chosen provider only DELIVERS the message — codes are always generated,
 * hashed and verified on this server (lib/otp/core.js), so login security never
 * depends on a provider callback.
 */
const env = require("../../../config/env");

const providers = {
  twofactor: () => require("./twofactor"),
  msg91: () => require("./msg91"),
  twilio: () => require("./twilio"),
  mock: () => require("./mock"),
};

/**
 * Sends an OTP through the configured provider.
 * Throws on any failure — callers must surface a 502/503 and must NOT create a
 * challenge the user could "verify" (no fake success).
 */
async function sendOtp({ phone, code }) {
  if (!env.otpEnabled()) {
    const err = new Error("OTP login is not enabled on this server.");
    err.status = 503;
    throw err;
  }
  const loader = providers[env.OTP_PROVIDER];
  if (!loader) {
    const err = new Error("OTP login is not configured.");
    err.status = 503;
    throw err;
  }
  return loader().sendOtp({ phone, code });
}

module.exports = { sendOtp };
