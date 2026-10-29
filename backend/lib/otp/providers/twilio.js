/**
 * Twilio driver — official twilio Node SDK (alternative to MSG91).
 * Works in India, but Indian traffic still requires DLT registration: the
 * sender number must be DLT-provisioned and TWILIO_SMS_TEMPLATE must match
 * the DLT-approved content exactly ({{code}} is replaced server-side).
 *
 * Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
 */
const env = require("../../../config/env");

let client;
function getClient() {
  if (!client) client = require("twilio")(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendOtp({ phone, code }) {
  const body = String(env.TWILIO_SMS_TEMPLATE || "Your Nilaara login OTP is {{code}}.").replace("{{code}}", code);
  const msg = await getClient().messages.create({
    from: env.TWILIO_FROM_NUMBER,
    to: `+91${phone}`, // India default; add a country-code env if you expand internationally
    body,
  });
  return { provider: "twilio", messageId: msg.sid || null };
}

module.exports = { sendOtp };
