/**
 * 2Factor.in driver — India-focused OTP SMS (DLT-compliant transactional SMS).
 * Uses the documented "pre-generated OTP" flow with Node's built-in fetch:
 *   GET https://2factor.in/api/v2/{API_KEY}/SMS/{mobile}/{otp}/{template_name}
 * Docs: https://2factor.in/docs/sms/#pre-generated-otp
 *
 * We generate the code on THIS server (CSPRNG, HMAC-hashed — lib/otp/core.js)
 * and hand it to 2Factor.in purely for delivery; verification is always local,
 * so login security never depends on a provider callback.
 *
 * Requires: TWOFACOR_API_KEY. TWOFACOR_TEMPLATE is the DLT-registered template
 * name configured on the 2Factor.in account ("auto" uses their default flow).
 */
const env = require("../../../config/env");

async function sendOtp({ phone, code }) {
  const template = encodeURIComponent(env.TWOFACOR_TEMPLATE || "auto");
  const url = `https://2factor.in/api/v2/${encodeURIComponent(env.TWOFACOR_API_KEY)}/SMS/${encodeURIComponent(phone)}/${encodeURIComponent(code)}/${template}`;
  const res = await fetch(url, { method: "GET" }).catch((e) => {
    throw new Error(`2Factor.in unreachable: ${e.message}`);
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  // 2Factor.in reports logical failures with non-"Success" Status (sometimes HTTP 200).
  if (!res.ok || !data || data.Status !== "Success") {
    const msg = (data && (data.Details || data.Message)) || `HTTP ${res.status}`;
    throw new Error(`2Factor.in send failed: ${msg}`);
  }
  return { provider: "2factor", messageId: data.request_id || null };
}

module.exports = { sendOtp };
