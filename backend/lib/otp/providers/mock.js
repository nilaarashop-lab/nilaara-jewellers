/**
 * Test-only provider. It records codes in process memory so integration tests
 * can read them — it NEVER sends an SMS.
 *
 * Guard rails:
 *  - config/env.js rejects OTP_PROVIDER="mock" when NODE_ENV=production.
 *  - This module double-checks at call time and refuses to run in production.
 */
const env = require("../../../config/env");

const sent = new Map(); // phone -> last code (tests only)

async function sendOtp({ phone, code }) {
  if (env.isProd) throw new Error("The mock OTP provider is not permitted in production.");
  sent.set(phone, code);
  return { provider: "mock", messageId: `mock-${Date.now()}` };
}

/** Test helper — last code "sent" to a phone. */
function getLastCode(phone) {
  return sent.get(phone) || null;
}

function clear() {
  sent.clear();
}

module.exports = { sendOtp, getLastCode, clear };
