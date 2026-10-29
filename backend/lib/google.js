/**
 * Google Sign-In verification (Identity Services) — server side only.
 *
 * The frontend only ever forwards the raw `credential` (ID token) string.
 * Email, user id, name or role supplied by the browser is NEVER trusted —
 * everything here comes from the token payload, which google-auth-library
 * verifies against Google's real cryptographic keys (signature, audience,
 * issuer, expiry).
 *
 * Account-linking policy (see planAccount for the pure decision function):
 *  - Sign-in is keyed on Google's stable subject ("sub") — `googleId`.
 *  - A verified email may LINK an existing customer account to Google, but
 *    - staff/admin accounts can never be accessed or linked via Google, and
 *    - an email that already belongs to a different Google identity is refused.
 *  - Google sign-in always produces/uses a "customer" account. It can NEVER
 *    grant, preserve, or elevate admin permissions.
 */
const env = require("../config/env");
const { HttpError } = require("./apiError");

const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/**
 * Verifies a Google ID token with Google's official library.
 * Returns the trusted payload ({ sub, email, email_verified, name, picture, ... }).
 * Throws 503 when Google login is not configured, 400 for any invalid token.
 */
async function verifyGoogleToken(credential) {
  if (!env.googleEnabled()) throw new HttpError(503, "Google sign-in is not configured on this server.");
  if (typeof credential !== "string" || credential.length < 20) throw new HttpError(400, "Invalid Google credential.");

  let payload;
  try {
    const { OAuth2Client } = require("google-auth-library");
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (e) {
    // Signature/audience/expiry failure — never reveal which check failed.
    throw new HttpError(400, "Google sign-in could not be verified. Please try again.");
  }
  if (!payload || !payload.sub || !ISSUERS.has(payload.iss)) throw new HttpError(400, "Invalid Google credential.");
  if (!payload.email_verified) throw new HttpError(400, "Your Google account email is not verified. Verify it with Google and try again.");
  return payload;
}

/**
 * PURE account-linking policy — no database access, fully unit-testable.
 *
 * @param {{sub:string, email?:string, name?:string, picture?:string}} payload verified Google payload
 * @param {{byGoogleId?:object, byEmail?:object}} existing users found by googleId / normalized email
 * @returns {{action:"login"|"create"|"link", patch?:object}} |
 *          {action:"error", status:number, message:string}
 */
function planAccount(payload, existing = {}) {
  const { sub, email, name } = payload;
  if (!sub) return { action: "error", status: 400, message: "Invalid Google credential." };

  // 1. Known Google identity → sign in to that account.
  if (existing.byGoogleId) return { action: "login", user: existing.byGoogleId };

  // 2. Verified email matches an existing account → link carefully.
  if (existing.byEmail) {
    const target = existing.byEmail;
    if (["admin", "staff"].includes(target.role)) {
      // Privileged accounts must authenticate with their password only.
      return {
        action: "error",
        status: 403,
        message: "Staff and admin accounts must sign in with their password, not Google.",
      };
    }
    if (target.googleId && target.googleId !== sub) {
      // Email already tied to a different Google identity — possible takeover attempt.
      return {
        action: "error",
        status: 409,
        message: "This email is already linked to a different Google account. Sign in with Google directly or contact support.",
      };
    }
    // Safe to link: Google verified email ownership (email_verified) and the
    // target is a non-privileged customer account.
    return { action: "link", user: target, patch: { googleId: sub, emailVerified: true } };
  }

  // 3. Brand-new customer.
  return {
    action: "create",
    patch: {
      googleId: sub,
      email: email || undefined,
      name: String(name || "Nilaara Customer").slice(0, 120),
      provider: "google",
      role: "customer", // hardcoded — Google login can never create privileged accounts
      emailVerified: Boolean(email),
    },
  };
}

module.exports = { verifyGoogleToken, planAccount };
