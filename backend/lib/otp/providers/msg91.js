/**
 * MSG91 driver — recommended for India (DLT-compliant OTP API).
 * Uses the documented v5 REST API with Node's built-in fetch (no SDK needed).
 * Docs: https://docs.msg91.com/reference/otp-v2
 *
 * Requires: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID (DLT-registered OTP template).
 * The DLT template already contains the {{otp}} variable, so we pass our
 * server-generated code explicitly.
 */
const env = require("../../../config/env");

const ENDPOINT = "https://control.msg91.com/api/v5/otp";

async function sendOtp({ phone, code }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authkey: env.MSG91_AUTH_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      mobile: `${env.MSG91_COUNTRY_CODE || "91"}${phone}`,
      otp: code,
      template_id: env.MSG91_TEMPLATE_ID,
      ...(env.MSG91_SENDER_ID ? { sender: env.MSG91_SENDER_ID } : {}),
    }),
  }).catch((e) => {
    throw new Error(`MSG91 unreachable: ${e.message}`);
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  // MSG91 reports logical failures with HTTP 200 + type:"error".
  if (!res.ok || !data || data.type !== "success") {
    const msg = (data && (data.message || data.error?.message)) || `HTTP ${res.status}`;
    throw new Error(`MSG91 send failed: ${msg}`);
  }
  return { provider: "msg91", messageId: data.requestId || null };
}

module.exports = { sendOtp };
