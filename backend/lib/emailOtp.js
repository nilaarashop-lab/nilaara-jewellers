/**
 * Email OTP delivery via Resend (https://resend.com/docs).
 * Uses the documented REST API with Node's built-in fetch — no SDK needed.
 *
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer re_xxx
 *   { from, to: [email], subject, text, html }
 *
 * The code itself is generated and verified on THIS server (lib/otp/core.js,
 * purpose "email"); Resend only delivers the message. Failures throw so the
 * route can answer 502 and delete the challenge — never a fake success.
 *
 * Requires: RESEND_API_KEY and a RESEND_FROM address on a domain verified in
 * Resend (DNS records), e.g. "Nilaara Jewellers <otp@shop.nilaara.com>".
 */
const env = require("../config/env");

const ENDPOINT = "https://api.resend.com/emails";

async function sendEmailOtp({ email, code, ttlSeconds }) {
  const minutes = Math.max(1, Math.round((ttlSeconds || env.OTP_TTL_SECONDS) / 60));
  const subject = "Your Nilaara login code";
  const text = `Your Nilaara Jewellers login code is ${code}. It is valid for ${minutes} minute(s). Do not share it with anyone — our team will never ask for it.`;
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;color:#3a1010;background:#fdf9f2;padding:24px">
    <div style="max-width:420px;margin:auto;background:#fff;border:1px solid #e8dcc0;border-radius:12px;padding:28px">
      <p style="letter-spacing:3px;color:#8a1c1c;font-size:12px;margin:0 0 6px">NILAARA JEWELLERS</p>
      <h2 style="margin:0 0 12px;color:#5c1212">Your login code</h2>
      <p style="font-size:26px;letter-spacing:10px;font-weight:700;color:#8a1c1c;margin:14px 0">${code}</p>
      <p style="font-size:13px;color:#6b6257">Valid for ${minutes} minute(s). Do not share this code with anyone — our team will never ask for it.</p>
    </div></body></html>`;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.RESEND_FROM, to: [email], subject, text, html }),
  }).catch((e) => {
    throw new Error(`Resend unreachable: ${e.message}`);
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || !data || data.error) {
    const msg = (data && data.message) || (data && data.error) || `HTTP ${res.status}`;
    throw new Error(`Resend send failed: ${msg}`);
  }
  return { provider: "resend", messageId: data.id || null };
}

module.exports = { sendEmailOtp };
