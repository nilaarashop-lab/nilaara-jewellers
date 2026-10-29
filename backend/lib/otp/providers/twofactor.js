/**
 * 2Factor.in driver — India-focused OTP SMS (DLT-compliant transactional SMS).
 * Uses the documented "pre-generated OTP" flow with Node's built-in fetch:
 *   GET https://2factor.in/API/V1/{API_KEY}/SMS/{mobile}/{otp}/{template_name}
 * Docs: https://2factor.in/docs/sms/#pre-generated-otp
 * (The /api/v2/ path their newer docs mention returns 404 — API/V1 is live.)
 *
 * We generate the code on THIS server (CSPRNG, HMAC-hashed — lib/otp/core.js)
 * and hand it to 2Factor.in purely for delivery; verification is always local,
 * so login security never depends on a provider callback.
 *
 * Requires: TWOFACOR_API_KEY and TWOFACOR_TEMPLATE (the template approved on the
 * 2Factor.in account). The URL above is the ONLY channel control this API has —
 * there is no SMS/voice parameter, and the session id in Details is the only
 * handle 2Factor support has to see what their gateway actually did.
 */
const env = require("../../../config/env");

async function sendOtp({ phone, code }) {
  const template = encodeURIComponent(env.TWOFACOR_TEMPLATE);
  const url = `https://2factor.in/API/V1/${encodeURIComponent(env.TWOFACOR_API_KEY)}/SMS/${encodeURIComponent(phone)}/${encodeURIComponent(code)}/${template}`;
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
  // "Success" means 2Factor accepted the request, not that an SMS was delivered —
  // the session id is what their support team needs to trace the actual channel.
  const sessionId = data.Details || data.request_id || null;
  if (sessionId) console.info(`[otp] 2factor accepted session=${sessionId} phone=${phone.slice(0, 2)}******${phone.slice(-2)}`);
  return { provider: "2factor", messageId: sessionId };
}

module.exports = { sendOtp };
