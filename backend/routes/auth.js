/**
 * Authentication routes.
 *
 * Sign-in methods (all produce the same server-side session cookie):
 *  1. Email/mobile + password  — POST /login
 *  2. Google Identity Services — POST /google      (ID token verified with google-auth-library)
 *  3. Mobile OTP (real SMS)    — POST /otp/request + /otp/verify (2Factor.in / MSG91 / Twilio)
 *  4. Email OTP (Resend)       — POST /email/otp/request + /email/otp/verify
 *
 * Security properties:
 *  - Sessions are httpOnly, SameSite=Lax, Secure-in-prod cookies backed by
 *    server records (lib/session.js). Tokens are rotated on every login
 *    (fixation defence) and destroyed on logout.
 *  - Password login timing-equalises the "unknown user" path (no enumeration
 *    via response time) and always returns a generic 401.
 *  - OTP codes are CSPRNG-generated, HMAC-hashed at rest, constant-time
 *    verified, expire in minutes, are limited to a few attempts, and are NEVER
 *    returned in responses or logged. Delivery is by a real SMS provider only.
 *  - Google payloads are cryptographically verified server-side; the frontend
 *    never supplies email/user-id/role. Google login can only ever yield a
 *    "customer" account — never admin/staff.
 *  - There is NO admin bootstrap via the API: the first administrator is
 *    created with `npm run create-admin`.
 */
const express = require("express");
const bcrypt = require("bcryptjs");
const z = require("zod");
const env = require("../config/env");
const User = require("../models/User");
const OtpChallenge = require("../models/OtpChallenge");
const { validate } = require("../middleware/validate");
const { requireUser } = require("../middleware/auth");
const { asyncHandler, HttpError, fail } = require("../lib/apiError");
const { createLimiter } = require("../lib/rateLimit");
const { COOKIE_NAME, createSession, setSessionCookie, destroySession, clearSessionCookie } = require("../lib/session");
const { verifyGoogleToken, planAccount } = require("../lib/google");
const { normalizePhone, generateCode, hashOtp, verifyOtpHash, isExpired, attemptsExhausted, maskPhone, maskEmail } = require("../lib/otp/core");
const otpProviders = require("../lib/otp/providers");
const { sendEmailOtp } = require("../lib/emailOtp");
const { audit } = require("../lib/audit");

const router = express.Router();

// ── Rate limiters (sliding window, per process — see docs/AUTH.md for Redis note) ──
const loginLimiter = createLimiter({
  windowMs: env.LOGIN_WINDOW_MIN * 60 * 1000,
  max: env.LOGIN_MAX_ATTEMPTS,
  keyFn: (req) => `${req.ip}:login:${String(req.body?.id || "").toLowerCase()}`,
  message: "Too many login attempts. Please wait a few minutes and try again.",
});
const registerLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: env.REGISTER_PER_IP, message: "Too many accounts from this device. Try again later." });
const googleLimiter = createLimiter({ windowMs: 10 * 60 * 1000, max: 10, message: "Too many sign-in attempts. Please try again shortly." });
const otpReqPhoneLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: env.OTP_REQ_PER_PHONE,
  keyFn: (req) => `otp-req-phone:${req.body?.phone || ""}`,
  message: "Too many codes requested for this number. Please try again later.",
});
const otpReqIpLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: env.OTP_REQ_PER_IP,
  keyFn: (req) => `otp-req-ip:${req.ip}`,
  message: "Too many verification requests from this device. Please try again later.",
});
const otpVerifyPhoneLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.OTP_VERIFY_PER_PHONE,
  keyFn: (req) => `otp-ver-phone:${req.body?.phone || ""}`,
  message: "Too many verification attempts. Please try again later.",
});
const otpVerifyIpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.OTP_VERIFY_PER_IP,
  keyFn: (req) => `otp-ver-ip:${req.ip}`,
  message: "Too many verification attempts from this device. Please try again later.",
});
// Email OTP limiters — separate buckets from SMS so one channel cannot starve the other.
const emailOtpReqEmailLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: env.OTP_REQ_PER_PHONE,
  keyFn: (req) => `eotp-req-email:${String(req.body?.email || "").toLowerCase()}`,
  message: "Too many codes requested for this email. Please try again later.",
});
const emailOtpReqIpLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: env.OTP_REQ_PER_IP,
  keyFn: (req) => `eotp-req-ip:${req.ip}`,
  message: "Too many verification requests from this device. Please try again later.",
});
const emailOtpVerifyEmailLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.OTP_VERIFY_PER_PHONE,
  keyFn: (req) => `eotp-ver-email:${String(req.body?.email || "").toLowerCase()}`,
  message: "Too many verification attempts. Please try again later.",
});
const emailOtpVerifyIpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.OTP_VERIFY_PER_IP,
  keyFn: (req) => `eotp-ver-ip:${req.ip}`,
  message: "Too many verification attempts from this device. Please try again later.",
});

// ── Schemas ──
const loginSchema = z.object({
  id: z.string().min(3).max(160), // email or phone
  password: z.string().min(1).max(200),
});
const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(), // normalized server-side
  password: z.string().min(6).max(200),
});
const googleSchema = z.object({ credential: z.string().min(20).max(4096) });
const otpRequestSchema = z.object({ phone: z.string().min(5).max(20) });
const otpVerifySchema = z.object({
  phone: z.string().min(5).max(20),
  otp: z.string().regex(/^[0-9]{4,10}$/, "Enter the digits from the SMS"),
});
const emailOtpRequestSchema = z.object({ email: z.string().email().max(160) });
const emailOtpVerifySchema = z.object({
  email: z.string().email().max(160),
  otp: z.string().regex(/^[0-9]{4,10}$/, "Enter the digits from the email"),
});
const mePatchSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    email: z.string().email().optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined, { message: "Nothing to update." });

// ── Helpers ──

/** bcrypt hash used to equalise the response time of the "unknown user" path. */
let timingDummy = null;
async function timingEqualize(password) {
  if (!timingDummy) timingDummy = await bcrypt.hash("nilaara-timing-equalizer", env.BCRYPT_ROUNDS);
  await bcrypt.compare(password, timingDummy);
}

/** Issues a fresh session, rotating (destroying) any existing one — fixation defence. */
async function startSession(req, res, user) {
  await destroySession(req.cookies?.[COOKIE_NAME]); // revoke the old token if present
  const token = await createSession(user._id, { ip: req.ip, userAgent: req.get("user-agent") });
  setSessionCookie(res, token);
  user.lastLoginAt = new Date();
  await user.save();
  return token;
}

function assertActive(user) {
  if (user.status !== "active") fail(403, "This account has been disabled. Please contact support.");
}

// ── Password login / registration ──

// POST /api/auth/login { id, password }
router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { id, password } = req.body;
    const normalizedPhone = normalizePhone(id);
    const user = await User.findOne({ $or: [{ email: id.toLowerCase() }, ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])] });
    if (!user) {
      await timingEqualize(password); // same response time as a wrong password
      await audit(req, "auth.login_failed", { type: "user", id }, { reason: "unknown_user" });
      fail(401, "Invalid credentials.");
    }
    if (!(await user.verifyPassword(password))) {
      await audit(req, "auth.login_failed", { type: "user", id: String(user._id) }, { reason: "bad_password" });
      fail(401, "Invalid credentials.");
    }
    assertActive(user);
    await startSession(req, res, user);
    await audit(req, "auth.login", { type: "user", id: String(user._id) }, { method: "password" });
    res.json({ user: user.toPublic() });
  })
);

// POST /api/auth/register { name, email? , phone?, password } — role is ALWAYS customer
router.post(
  "/register",
  registerLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    const phone = normalizePhone(req.body.phone);
    if (req.body.phone && !phone) fail(400, "Enter a valid 10-digit Indian mobile number.");
    if (!email && !phone) fail(400, "Email or phone is required.");
    const exists = await User.findOne({ $or: [email ? { email } : null, phone ? { phone } : null].filter(Boolean) });
    if (exists) fail(409, "An account with these details already exists — please log in.");
    const user = await User.create({ name, email, phone, provider: "password", role: "customer" }); // role never taken from the request
    await user.setPassword(password);
    if (phone) user.phoneVerified = false; // a phone added at signup is NOT verified until an OTP confirms it
    await user.save();
    await startSession(req, res, user);
    await audit(req, "auth.register", { type: "user", id: String(user._id) }, { method: "password" });
    res.status(201).json({ user: user.toPublic() });
  })
);

// ── Google Sign-In ──

// POST /api/auth/google { credential } — the raw Google ID token from GIS
router.post(
  "/google",
  googleLimiter,
  validate(googleSchema),
  asyncHandler(async (req, res) => {
    const payload = await verifyGoogleToken(req.body.credential); // signature/aud/iss/exp verified by google-auth-library
    const email = payload.email ? String(payload.email).toLowerCase() : null;
    let user = await User.findOne({ googleId: payload.sub });
    if (!user && email) user = await User.findOne({ email });
    const plan = planAccount({ sub: payload.sub, email, name: payload.name }, { byGoogleId: user && user.googleId === payload.sub ? user : null, byEmail: user && user.googleId !== payload.sub ? user : null });
    if (plan.action === "error") fail(plan.status, plan.message);

    if (plan.action === "login") {
      assertActive(plan.user);
      await startSession(req, res, plan.user);
      await audit(req, "auth.login", { type: "user", id: String(plan.user._id) }, { method: "google" });
      return res.json({ user: plan.user.toPublic() });
    }

    if (plan.action === "link") {
      // Verified email + non-privileged customer → attach the Google identity.
      Object.assign(plan.user, plan.patch);
      await plan.user.save();
      await startSession(req, res, plan.user);
      await audit(req, "auth.google_link", { type: "user", id: String(plan.user._id) }, { via: "login" });
      return res.json({ user: plan.user.toPublic() });
    }

    // create — handle the double-click race via the unique googleId index.
    let created;
    try {
      created = await User.create({ ...plan.patch, status: "active" });
    } catch (e) {
      if (e.code === 11000) {
        const retry = await User.findOne({ $or: [{ googleId: payload.sub }, ...(email ? [{ email }] : [])] });
        if (!retry) throw e;
        assertActive(retry);
        await startSession(req, res, retry);
        return res.json({ user: retry.toPublic() });
      }
      throw e;
    }
    await startSession(req, res, created);
    await audit(req, "auth.register", { type: "user", id: String(created._id) }, { method: "google" });
    res.status(201).json({ user: created.toPublic() });
  })
);

// POST /api/auth/google/link { credential } — attach Google to the CURRENT session's account
router.post(
  "/google/link",
  requireUser,
  googleLimiter,
  validate(googleSchema),
  asyncHandler(async (req, res) => {
    if (["admin", "staff"].includes(req.user.role)) fail(403, "Staff and admin accounts use password sign-in only.");
    const payload = await verifyGoogleToken(req.body.credential);
    if (req.user.googleId === payload.sub) return res.json({ user: req.user.toPublic(), alreadyLinked: true });

    const email = payload.email ? String(payload.email).toLowerCase() : null;
    const taken = await User.findOne({ googleId: payload.sub });
    if (taken && String(taken._id) !== String(req.user._id)) fail(409, "This Google account is already linked to a different customer.");
    if (email) {
      const emailOwner = await User.findOne({ email });
      if (emailOwner && String(emailOwner._id) !== String(req.user._id)) {
        fail(409, "This Google account's email belongs to another customer. Sign in with Google instead, or contact support.");
      }
    }
    req.user.googleId = payload.sub;
    if (email && !req.user.email) {
      req.user.email = email;
      req.user.emailVerified = true;
    }
    await req.user.save();
    await audit(req, "auth.google_link", { type: "user", id: String(req.user._id) }, { via: "profile" });
    res.json({ user: req.user.toPublic() });
  })
);

// ── Mobile OTP (real SMS provider) ──

// POST /api/auth/otp/request { phone }
router.post(
  "/otp/request",
  otpReqIpLimiter,
  otpReqPhoneLimiter,
  validate(otpRequestSchema),
  asyncHandler(async (req, res) => {
    if (!env.otpEnabled()) fail(503, "OTP login is not available yet — please use email & password.");
    const phone = normalizePhone(req.body.phone);
    if (!phone) fail(400, "Enter a valid 10-digit Indian mobile number.");

    // Resend cooldown — reuse the existing challenge's sentAt.
    const existing = await OtpChallenge.findOne({ phone });
    if (existing) {
      const waitSec = env.OTP_RESEND_COOLDOWN_SEC - Math.floor((Date.now() - new Date(existing.sentAt).getTime()) / 1000);
      if (waitSec > 0) {
        res.set("Retry-After", String(waitSec));
        return res.status(429).json({ error: `Please wait ${waitSec}s before requesting another code.`, retryAfterSec: waitSec });
      }
    }

    const code = generateCode();
    const now = new Date();
    const challenge = await OtpChallenge.findOneAndUpdate(
      { phone },
      {
        phone,
        channel: "sms",
        codeHash: hashOtp(phone, code),
        expiresAt: new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000),
        attempts: 0,
        sentAt: now,
        ip: req.ip,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      const result = await otpProviders.sendOtp({ phone, code }); // real provider — throws on failure
      challenge.provider = result.provider;
      await challenge.save();
    } catch (e) {
      // Never leave a challenge that could "verify" a message that was never sent.
      await OtpChallenge.deleteOne({ _id: challenge._id });
      console.error(`[otp] send failed via ${env.OTP_PROVIDER}:`, e.message);
      return res.status(502).json({ error: "We could not send the verification SMS right now. Please try again in a moment." });
    }

    await audit(req, "auth.otp_requested", { type: "phone", id: phone }, { provider: env.OTP_PROVIDER });
    res.json({
      ok: true,
      phone: maskPhone(phone),
      cooldown: env.OTP_RESEND_COOLDOWN_SEC,
      expiresIn: env.OTP_TTL_SECONDS,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
    });
  })
);

// POST /api/auth/otp/verify { phone, otp } — logs in (or creates) the customer
router.post(
  "/otp/verify",
  otpVerifyIpLimiter,
  otpVerifyPhoneLimiter,
  validate(otpVerifySchema),
  asyncHandler(async (req, res) => {
    if (!env.otpEnabled()) fail(503, "OTP login is not available yet — please use email & password.");
    const phone = normalizePhone(req.body.phone);
    if (!phone) fail(400, "Enter a valid 10-digit Indian mobile number.");

    const challenge = await OtpChallenge.findOne({ phone });
    if (!challenge) fail(400, "No active verification for this number — request a new code.");
    if (isExpired(challenge)) {
      await OtpChallenge.deleteOne({ _id: challenge._id });
      fail(400, "That code has expired — request a new one.");
    }
    if (attemptsExhausted(challenge)) {
      await OtpChallenge.deleteOne({ _id: challenge._id });
      fail(429, "Too many incorrect attempts — request a new code.");
    }

    if (!verifyOtpHash(phone, String(req.body.otp).trim(), challenge.codeHash)) {
      challenge.attempts += 1;
      const locked = attemptsExhausted(challenge);
      if (locked) await OtpChallenge.deleteOne({ _id: challenge._id });
      else await challenge.save();
      await audit(req, "auth.otp_failed", { type: "phone", id: phone }, { attempts: challenge.attempts });
      return res.status(locked ? 429 : 400).json({
        error: locked ? "Too many incorrect attempts — request a new code." : `Incorrect code. ${env.OTP_MAX_ATTEMPTS - challenge.attempts} attempt(s) left.`,
      });
    }

    // Success — the code is single-use.
    await OtpChallenge.deleteOne({ _id: challenge._id });

    let user = await User.findOne({ phone });
    if (user) {
      assertActive(user);
      if (!user.phoneVerified) {
        user.phoneVerified = true; // OTP verification is authoritative for this number
        await user.save();
      }
    } else {
      user = await User.create({
        name: phone, // placeholder until the customer sets a name in their account
        phone,
        provider: "phone",
        role: "customer", // OTP sign-in can never create privileged accounts
        phoneVerified: true,
      });
    }
    await startSession(req, res, user);
    await audit(req, "auth.login", { type: "user", id: String(user._id) }, { method: "otp" });
    res.json({ user: user.toPublic() });
  })
);

// ── Email OTP (Resend) ──

// POST /api/auth/email/otp/request { email }
router.post(
  "/email/otp/request",
  emailOtpReqIpLimiter,
  emailOtpReqEmailLimiter,
  validate(emailOtpRequestSchema),
  asyncHandler(async (req, res) => {
    if (!env.emailOtpEnabled()) fail(503, "Email verification is not available yet — please use your mobile or password.");
    const email = String(req.body.email).toLowerCase().trim();

    // Resend cooldown — reuse the existing challenge's sentAt.
    const existing = await OtpChallenge.findOne({ email });
    if (existing) {
      const waitSec = env.OTP_RESEND_COOLDOWN_SEC - Math.floor((Date.now() - new Date(existing.sentAt).getTime()) / 1000);
      if (waitSec > 0) {
        res.set("Retry-After", String(waitSec));
        return res.status(429).json({ error: `Please wait ${waitSec}s before requesting another code.`, retryAfterSec: waitSec });
      }
    }

    const code = generateCode();
    const now = new Date();
    const challenge = await OtpChallenge.findOneAndUpdate(
      { email },
      {
        email,
        channel: "email",
        codeHash: hashOtp(email, code, "email"), // purpose "email" — never cross-verifies with SMS codes
        expiresAt: new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000),
        attempts: 0,
        sentAt: now,
        ip: req.ip,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      const result = await sendEmailOtp({ email, code, ttlSeconds: env.OTP_TTL_SECONDS });
      challenge.provider = result.provider;
      await challenge.save();
    } catch (e) {
      // Never leave a challenge that could "verify" a message that was never sent.
      await OtpChallenge.deleteOne({ _id: challenge._id });
      console.error("[email-otp] send failed via resend:", e.message);
      return res.status(502).json({ error: "We could not send the verification email right now. Please try again in a moment." });
    }

    await audit(req, "auth.otp_requested", { type: "email", id: email }, { provider: "resend" });
    res.json({
      ok: true,
      email: maskEmail(email),
      cooldown: env.OTP_RESEND_COOLDOWN_SEC,
      expiresIn: env.OTP_TTL_SECONDS,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
    });
  })
);

// POST /api/auth/email/otp/verify { email, otp } — logs in (or creates) the customer
router.post(
  "/email/otp/verify",
  emailOtpVerifyIpLimiter,
  emailOtpVerifyEmailLimiter,
  validate(emailOtpVerifySchema),
  asyncHandler(async (req, res) => {
    if (!env.emailOtpEnabled()) fail(503, "Email verification is not available yet — please use your mobile or password.");
    const email = String(req.body.email).toLowerCase().trim();

    const challenge = await OtpChallenge.findOne({ email });
    if (!challenge || challenge.channel !== "email") fail(400, "No active verification for this email — request a new code.");
    if (isExpired(challenge)) {
      await OtpChallenge.deleteOne({ _id: challenge._id });
      fail(400, "That code has expired — request a new one.");
    }
    if (attemptsExhausted(challenge)) {
      await OtpChallenge.deleteOne({ _id: challenge._id });
      fail(429, "Too many incorrect attempts — request a new code.");
    }

    if (!verifyOtpHash(email, String(req.body.otp).trim(), challenge.codeHash, "email")) {
      challenge.attempts += 1;
      const locked = attemptsExhausted(challenge);
      if (locked) await OtpChallenge.deleteOne({ _id: challenge._id });
      else await challenge.save();
      await audit(req, "auth.otp_failed", { type: "email", id: email }, { attempts: challenge.attempts });
      return res.status(locked ? 429 : 400).json({
        error: locked ? "Too many incorrect attempts — request a new code." : `Incorrect code. ${env.OTP_MAX_ATTEMPTS - challenge.attempts} attempt(s) left.`,
      });
    }

    // Success — the code is single-use.
    await OtpChallenge.deleteOne({ _id: challenge._id });

    let user = await User.findOne({ email });
    if (user) {
      assertActive(user);
      if (!user.emailVerified) {
        user.emailVerified = true; // receiving the code at this inbox is authoritative
        await user.save();
      }
    } else {
      user = await User.create({
        name: email.split("@")[0], // placeholder until the customer sets a name
        email,
        provider: "email",
        role: "customer", // email OTP can never create privileged accounts
        emailVerified: true,
      });
    }
    await startSession(req, res, user);
    await audit(req, "auth.login", { type: "user", id: String(user._id) }, { method: "email_otp" });
    res.json({ user: user.toPublic() });
  })
);

// ── Profile ──

// POST /api/auth/logout
router.post("/logout", asyncHandler(async (req, res) => {
  await destroySession(req.cookies?.[COOKIE_NAME]);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

// GET /api/auth/me
router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  res.json({ user: req.user.toPublic() });
});

// PATCH /api/auth/me { name?, email? } — update the signed-in customer's profile
router.patch(
  "/me",
  requireUser,
  validate(mePatchSchema),
  asyncHandler(async (req, res) => {
    const { name, email } = req.body;
    if (name) req.user.name = name;
    if (email && email.toLowerCase() !== (req.user.email || "")) {
      const taken = await User.findOne({ email: email.toLowerCase() });
      if (taken && String(taken._id) !== String(req.user._id)) fail(409, "That email is already used by another account.");
      req.user.email = email.toLowerCase();
      req.user.emailVerified = false; // re-verification needed after a change
    }
    await req.user.save();
    await audit(req, "auth.profile_update", { type: "user", id: String(req.user._id) }, { fields: Object.keys(req.body) });
    res.json({ user: req.user.toPublic() });
  })
);

module.exports = router;
