/**
 * Central environment configuration with fail-fast validation.
 * - Loads backend/.env once.
 * - In production, refuses to start when required configuration is missing
 *   (no silent fallbacks to dev secrets, localhost databases or local disk storage).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const get = (k, fb = "") => (process.env[k] ?? fb).trim();

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};

const env = {
  NODE_ENV,
  isProd,
  PORT: Number(get("PORT", "5000")),
  // Dev convenience default; production MUST set an Atlas URI (validated below).
  MONGO_URI: get("MONGO_URI") || (isProd ? "" : "mongodb://127.0.0.1:27017/parinaya"),
  // Origin list, trailing slashes stripped — CORS compares them literally.
  FRONTEND_URL: get("FRONTEND_URL", "http://localhost:5173")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .join(","),
  PUBLIC_BASE_URL: get("PUBLIC_BASE_URL"), // e.g. https://api.nilaara.com (used to build absolute upload URLs)
  TRUST_PROXY: Number(get("TRUST_PROXY", "1")),

  // ── Image storage ──
  STORAGE_DRIVER: get("STORAGE_DRIVER", "local"), // local | cloudinary | imagekit
  UPLOAD_DIR: get("UPLOAD_DIR", path.join(__dirname, "..", "uploads")),
  MAX_UPLOAD_MB: Number(get("MAX_UPLOAD_MB", "5")),
  MAX_UPLOAD_FILES: Number(get("MAX_UPLOAD_FILES", "6")),
  CLOUDINARY_CLOUD_NAME: get("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: get("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: get("CLOUDINARY_API_SECRET"),
  // ImageKit storage (storage/imagekit.js). Only the PRIVATE key is required for
  // server-side uploads (used as the Basic-auth username). The public key is
  // only needed for browser-side ImageKit widgets (unused here so far) and the
  // URL endpoint only if the account uses a custom CDN CNAME.
  IMAGEKIT_PRIVATE_KEY: get("IMAGEKIT_PRIVATE_KEY"),
  IMAGEKIT_PUBLIC_KEY: get("IMAGEKIT_PUBLIC_KEY"),
  IMAGEKIT_URL_ENDPOINT: get("IMAGEKIT_URL_ENDPOINT"),
  // Hosts allowed for pasted/legacy image URLs (comma separated).
  // Production default: none — new image URLs must come from Cloudinary uploads.
  ALLOWED_IMAGE_HOSTS: get("ALLOWED_IMAGE_HOSTS", isProd ? "" : "images.unsplash.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // ── Sessions / auth ──
  COOKIE_SECURE: get("COOKIE_SECURE", isProd ? "true" : "false") === "true",
  // Session-cookie SameSite policy: "lax" | "strict" | "none".
  // The storefront proxies /api/* through its own domain (frontend/vercel.json),
  // so the session cookie is first-party and "lax" is the right policy. Safari and
  // every iOS browser reject a cookie set by another site — including SameSite=None
  // cookies — so a cross-site API only works on desktop browsers. Use "none" only
  // when a client calls this API cross-site directly; it also needs COOKIE_SECURE.
  COOKIE_SAMESITE: (get("COOKIE_SAMESITE").toLowerCase() || "lax"),
  SESSION_TTL_DAYS: Number(get("SESSION_TTL_DAYS", "7")),
  BCRYPT_ROUNDS: Number(get("BCRYPT_ROUNDS", "12")),
  LOGIN_MAX_ATTEMPTS: Number(get("LOGIN_MAX_ATTEMPTS", "5")),
  LOGIN_WINDOW_MIN: Number(get("LOGIN_WINDOW_MIN", "15")),
  REGISTER_PER_IP: Number(get("REGISTER_PER_IP", "10")), // new accounts per IP per hour

  // ── Google Sign-In (Identity Services — verified server-side) ──
  // Public client ID from Google Cloud Console → OAuth 2.0 Client IDs (Web).
  GOOGLE_CLIENT_ID: get("GOOGLE_CLIENT_ID"),

  // ── Mobile OTP (real SMS provider — see docs/AUTH.md) ──
  // Provider: "twofactor" (2Factor.in, India/DLT) | "msg91" | "twilio" | "" (OTP disabled)
  OTP_PROVIDER: get("OTP_PROVIDER").toLowerCase(),
  // 2Factor.in — India-focused OTP SMS. API key from the 2Factor.in dashboard.
  // Docs: https://2factor.in/docs/sms/#pre-generated-otp
  TWOFACOR_API_KEY: get("TWOFACOR_API_KEY"),
  // DLT-registered template name registered with the 2Factor.in account, or "auto".
  TWOFACOR_TEMPLATE: get("TWOFACOR_TEMPLATE"), // approved SMS OTP template name — required (no "auto": it can fall back to voice)
  MSG91_AUTH_KEY: get("MSG91_AUTH_KEY"),
  MSG91_TEMPLATE_ID: get("MSG91_TEMPLATE_ID"), // DLT-registered transactional OTP template
  MSG91_SENDER_ID: get("MSG91_SENDER_ID"), // DLT-registered header (optional for the OTP API)
  MSG91_COUNTRY_CODE: get("MSG91_COUNTRY_CODE", "91"),
  TWILIO_ACCOUNT_SID: get("TWILIO_ACCOUNT_SID"),
  TWILIO_AUTH_TOKEN: get("TWILIO_AUTH_TOKEN"),
  TWILIO_FROM_NUMBER: get("TWILIO_FROM_NUMBER"),
  // SMS body for the Twilio driver — must match your DLT-registered template text.
  // {{code}} is replaced with the OTP. (MSG91 uses MSG91_TEMPLATE_ID instead.)
  TWILIO_SMS_TEMPLATE: get("TWILIO_SMS_TEMPLATE", "Your Nilaara login OTP is {{code}}. Valid for 5 minutes. Do not share it with anyone."),
  // Secret used to HMAC OTP codes before storing them (never store codes in plaintext).
  // Required in production when OTP is enabled; a dev-only default is used elsewhere.
  OTP_HASH_SECRET: get("OTP_HASH_SECRET") || (isProd ? "" : "nilaara-dev-otp-secret"),
  OTP_TTL_SECONDS: Number(get("OTP_TTL_SECONDS", "300")), // code expiry: 5 minutes
  OTP_MAX_ATTEMPTS: Number(get("OTP_MAX_ATTEMPTS", "5")), // wrong tries before the code is invalidated
  OTP_RESEND_COOLDOWN_SEC: Number(get("OTP_RESEND_COOLDOWN_SEC", "30")), // min seconds between sends per phone
  OTP_LEN: Number(get("OTP_LEN", "6")),
  // Abuse protection limits (sliding window, per process).
  OTP_REQ_PER_PHONE: Number(get("OTP_REQ_PER_PHONE", "5")), // requests per phone per hour
  OTP_REQ_PER_IP: Number(get("OTP_REQ_PER_IP", "20")), // requests per IP per hour
  OTP_VERIFY_PER_PHONE: Number(get("OTP_VERIFY_PER_PHONE", "10")), // verify attempts per phone per 15 min
  OTP_VERIFY_PER_IP: Number(get("OTP_VERIFY_PER_IP", "30")), // verify attempts per IP per 15 min

  // ── Email OTP (Resend — see docs/AUTH.md) ──
  // API key from https://resend.com/api-keys. The sending domain must be
  // verified in Resend (DNS records) or deliveries bounce.
  RESEND_API_KEY: get("RESEND_API_KEY"),
  RESEND_FROM: get("RESEND_FROM", "Nilaara Jewellers <otp@nilaara.com>"),

  // ── Dev-only seed accounts (scripts/seed-test-accounts.js; refused in production) ──
  SEED_CUSTOMER_EMAIL: get("SEED_CUSTOMER_EMAIL"),
  SEED_CUSTOMER_PASSWORD: get("SEED_CUSTOMER_PASSWORD"),
  SEED_ADMIN_EMAIL: get("SEED_ADMIN_EMAIL"),
  SEED_ADMIN_PASSWORD: get("SEED_ADMIN_PASSWORD"),

  // ── Payments (server-side only; never exposed to React) ──
  RAZORPAY_KEY_ID: get("RAZORPAY_KEY_ID"),
  RAZORPAY_KEY_SECRET: get("RAZORPAY_KEY_SECRET"),
  RAZORPAY_WEBHOOK_SECRET: get("RAZORPAY_WEBHOOK_SECRET"),
};

env.paymentsEnabled = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
env.googleEnabled = () => Boolean(env.GOOGLE_CLIENT_ID);
env.otpEnabled = () => Boolean(env.OTP_PROVIDER);
env.emailOtpEnabled = () => Boolean(env.RESEND_API_KEY);
env.imageHostAllowlist = () => [
  "res.cloudinary.com",
  "cloudinary.com",
  "ik.imagekit.io", // ImageKit's default CDN host
  hostOf(env.IMAGEKIT_URL_ENDPOINT), // custom CNAME endpoint, when configured
  hostOf(env.PUBLIC_BASE_URL),
  ...env.ALLOWED_IMAGE_HOSTS,
].filter(Boolean);

/**
 * Fatal configuration problems. Non-empty => do not boot.
 */
function validateEnv() {
  const errors = [];
  if (!env.MONGO_URI) errors.push("MONGO_URI is required (MongoDB Atlas connection string).");
  else if (isProd && /127\.0\.0\.1|localhost/.test(env.MONGO_URI))
    errors.push("MONGO_URI points at localhost — production must use MongoDB Atlas or another managed database.");

  if (!["local", "cloudinary", "imagekit"].includes(env.STORAGE_DRIVER))
    errors.push(`STORAGE_DRIVER must be "local", "cloudinary" or "imagekit" (got "${env.STORAGE_DRIVER}").`);

  if (env.STORAGE_DRIVER === "cloudinary") {
    for (const k of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"])
      if (!env[k]) errors.push(`${k} is required when STORAGE_DRIVER=cloudinary.`);
  }
  if (env.STORAGE_DRIVER === "imagekit") {
    if (!env.IMAGEKIT_PRIVATE_KEY)
      errors.push('IMAGEKIT_PRIVATE_KEY is required when STORAGE_DRIVER=imagekit — paste the Private key from your ImageKit dashboard (Developer Options → API Keys → Private Key).');
    if (env.IMAGEKIT_URL_ENDPOINT && !/^https:\/\//.test(env.IMAGEKIT_URL_ENDPOINT))
      errors.push("IMAGEKIT_URL_ENDPOINT must be an https:// URL when set.");
  }
  if (isProd && env.STORAGE_DRIVER === "local")
    errors.push('STORAGE_DRIVER=local is not permitted in production — set "cloudinary" (local disk is ephemeral on most hosts).');

  if (Boolean(env.RAZORPAY_KEY_ID) !== Boolean(env.RAZORPAY_KEY_SECRET))
    errors.push("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be provided together.");
  if (isProd && env.COOKIE_SECURE === false) errors.push("COOKIE_SECURE=false is not permitted in production.");

  // ── Session cookie / storefront origin ──
  if (!["lax", "strict", "none"].includes(env.COOKIE_SAMESITE))
    errors.push(`COOKIE_SAMESITE must be "lax", "strict" or "none" (got "${env.COOKIE_SAMESITE}").`);
  if (env.COOKIE_SAMESITE === "none" && !env.COOKIE_SECURE)
    errors.push('COOKIE_SAMESITE="none" requires COOKIE_SECURE=true — browsers drop a SameSite=None cookie that is not Secure.');
  if (isProd) {
    const fronts = env.FRONTEND_URL.split(",").filter(Boolean);
    if (!fronts.length || fronts.some((o) => !/^https:\/\/[^/]+$/.test(o)))
      errors.push(
        "FRONTEND_URL must list the deployed storefront origin(s) as https:// origins, comma-separated — e.g. https://shop.example.com,https://your-app.vercel.app (localhost is not valid in production)."
      );
  }

  // ── Auth providers ──
  if (env.GOOGLE_CLIENT_ID && !/\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID))
    errors.push("GOOGLE_CLIENT_ID does not look like a Google OAuth web client ID (must end in .apps.googleusercontent.com).");

  if (env.OTP_PROVIDER && !["twofactor", "msg91", "twilio", "mock"].includes(env.OTP_PROVIDER))
    errors.push(`OTP_PROVIDER must be "twofactor", "msg91", "twilio" or empty (got "${env.OTP_PROVIDER}").`);
  if (isProd && env.OTP_PROVIDER === "mock")
    errors.push('OTP_PROVIDER="mock" is test-only and is not permitted in production.');
  if (env.OTP_PROVIDER === "twofactor" && !env.TWOFACOR_API_KEY)
    errors.push("TWOFACOR_API_KEY is required when OTP_PROVIDER=twofactor.");
  if (env.OTP_PROVIDER === "twofactor" && (!env.TWOFACOR_TEMPLATE || env.TWOFACOR_TEMPLATE.toLowerCase() === "auto"))
    errors.push('TWOFACOR_TEMPLATE must be your approved 2Factor SMS OTP template name — "auto"/empty can be delivered as a voice call.');
  if (env.OTP_PROVIDER === "msg91") {
    if (!env.MSG91_AUTH_KEY) errors.push("MSG91_AUTH_KEY is required when OTP_PROVIDER=msg91.");
    // MSG91_TEMPLATE_ID is optional: without it MSG91 sends through its own
    // default OTP template (verified working on this account), which is the
    // path available before DLT registration.
  }
  if (env.OTP_PROVIDER === "twilio") {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER)
      errors.push("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are required when OTP_PROVIDER=twilio.");
  }
  if (((env.OTP_PROVIDER && env.OTP_PROVIDER !== "mock") || env.emailOtpEnabled()) && !env.OTP_HASH_SECRET)
    errors.push("OTP_HASH_SECRET is required when OTP sign-in is enabled (set a long random string).");
  if (!(env.OTP_TTL_SECONDS >= 60 && env.OTP_TTL_SECONDS <= 900)) errors.push("OTP_TTL_SECONDS must be between 60 and 900.");
  if (!(env.OTP_MAX_ATTEMPTS >= 3 && env.OTP_MAX_ATTEMPTS <= 10)) errors.push("OTP_MAX_ATTEMPTS must be between 3 and 10.");

  return errors;
}

env.validateEnv = validateEnv;
module.exports = env;
