/**
 * MSG91 driver — India OTP delivered over SMS only; MSG91's OTP API has no
 * voice-call fallback. Docs: https://docs.msg91.com/otp/sendotp
 *
 * We generate, hash and verify the code on THIS server (lib/otp/core.js) and
 * pass it to MSG91 purely for delivery, so login never depends on MSG91 state.
 *
 * Requires: MSG91_AUTH_KEY. MSG91_TEMPLATE_ID and MSG91_SENDER_ID are optional —
 * with no DLT template MSG91 sends through its own default OTP template.
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
      ...(env.MSG91_TEMPLATE_ID ? { template_id: env.MSG91_TEMPLATE_ID } : {}),
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
    const msg = (data && (data.message || data.errors || data.error?.message)) || `HTTP ${res.status}`;
    throw new Error(`MSG91 send failed: ${msg}`);
  }
  // "success" means accepted, not delivered — log the request id as the trace.
  const requestId = data.request_id || data.requestId || null;
  if (requestId) console.info(`[otp] msg91 accepted request=${requestId} phone=${phone.slice(0, 2)}******${phone.slice(-2)}`);
  return { provider: "msg91", messageId: requestId };
}

module.exports = { sendOtp };
