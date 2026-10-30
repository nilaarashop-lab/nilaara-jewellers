# Customer Authentication — Nilaara Jewellers

> **Legacy reference only — not used by the deployed storefront.** The website is a static catalogue with WhatsApp ordering. There is no customer login, cart, checkout, or backend-admin login. Staff now edit content through the GitHub-backed admin at `/admin`. Everything below documents the archived backend for legacy data/reference only.

This guide covers the customer sign-in system: **email + password** (registration and login), plus **Google Sign-In**, the **email OTP (Resend)** code path (kept, currently unused by the UI — see below), the **mobile OTP** code path (kept but disabled via `OTP_PROVIDER`), the session/CSRF model, provider setup for India, environment variables, seed accounts, and testing.

> **Registration is currently unverified (interim).** Resend only delivers to any address once a sending domain is verified, so the register form creates the account immediately from name + email + password — no emailed code. The `POST /api/auth/email/otp/*` endpoints and the `RESEND_*` configuration are still in place; re-enabling verification is a front-end change plus a verified domain. Until then accounts are created with `emailVerified: false`, so nobody can prove ownership of an email address (which also rules out email-based password reset).

> **Status honesty:** the automated suite (97 tests, including full HTTP integration tests against an in-memory MongoDB) covers password login, SMS-OTP request/verify/expiry/lockout/cooldown/rate limits, **email-OTP** request/verify/expiry/lockout/cooldown/linking, Google **token rejection**, CSRF, logout, protected routes, server-side carts, login-required checkout and customer/admin/order-ownership separation. Three things **cannot** be tested without real credentials and are therefore *not* claimed as verified: **delivery of a real SMS** (needs a paid 2Factor.in/MSG91/Twilio account), **delivery of a real email OTP** (needs a verified Resend domain), **acceptance of a real Google ID token** (needs a Google OAuth client + a signed-in Google account), and **live Razorpay payments** (needs live/test keys). All are wired through the providers' official APIs and fail loudly (400/502/503) rather than faking success.

---

## 1. Sign-in methods

| Method | Endpoint(s) | UI |
|---|---|---|
| Email + password — **registration and customer sign-in** | `POST /api/auth/register` (creates the customer and starts the session), `POST /api/auth/login` | Register page (name + email + password), Login page; admin panel sign-in (`pages/Admin.jsx`) |
| Email OTP (Resend) | `POST /api/auth/email/otp/request` → `POST /api/auth/email/otp/verify` | **Not used by the UI** — kept for when a sending domain is verified in Resend |
| Mobile OTP | `POST /api/auth/otp/request` → `POST /api/auth/otp/verify` | **Disabled** — routes answer `503` while `OTP_PROVIDER` is empty |
| Google Identity Services | `POST /api/auth/google` | “Continue with Google” button (hidden unless configured) |
| Link Google to a signed-in account | `POST /api/auth/google/link` | Account page → “Sign-in & security” |

All methods produce the **same** server-side session (httpOnly cookie `nilaara_sid`). Registration stores the typed name (printed on booking slips) and a bcrypt password, then signs the customer in; a duplicate email answers `409`. One account per email/Google-subject is enforced by unique indexes. Phone numbers already stored on accounts are preserved and are simply no longer used for sign-in.

### Post-login redirect

Header/login links append `?next=<path>`; after a successful login the user returns there (`/login?next=/checkout`, etc.). Only same-site paths starting with `/` (not `//`) are accepted — no open redirects. Staff/admin accounts always land in `/admin`. The account page redirects to `/login?next=/account` when the session is missing.

---

## 2. OTP provider evaluation (India)

| Provider | India/DLT | Server integration | Notes |
|---|---|---|---|
| **2Factor.in** ✅ (current default) | Built for India; DLT-registered infrastructure | REST API via built-in `fetch` (pre-generated-OTP flow) — no SDK dependency | Purpose-built OTP platform; simple API key auth; pay-as-you-go |
| **MSG91** (alternative) | Built for India; DLT-registered sender IDs & templates | Official REST API (v5 OTP) via built-in `fetch` | Dedicated OTP product, generous free tier, DLT handled in-dashboard |
| **Twilio** (alternative) | Works, but Indian traffic still needs DLT registration on the sender | Official `twilio` Node SDK | Global reach, great DX; DLT is extra paperwork for India |
| Gupshup / Kaleyra / TextLocal | India-native | REST APIs | Viable; not wired in (provider abstraction makes adding one a ~30-line file) |

**Recommendation: 2Factor.in** for an India-deployed store (simplest setup: API key + DLT template, no dashboard flow gymnastics). MSG91/Twilio remain wired as drop-in alternatives via `OTP_PROVIDER`.

Provider selection: `OTP_PROVIDER=twofactor` (default in this project), `msg91`, or `twilio`.

### How OTPs are handled (independent of provider)

- Code generated server-side with `crypto.randomInt` (CSPRNG), 6 digits by default.
- Stored **only** as `HMAC-SHA256(OTP_HASH_SECRET, "login:<phone>:<code>")` in `OtpChallenge` — never plaintext, never returned in any API response, never logged.
- Verified server-side with `crypto.timingSafeEqual`; single-use (deleted on success); **5-minute TTL** (`OTP_TTL_SECONDS=300`); **5 wrong attempts** lock the code (`OTP_MAX_ATTEMPTS`); **30 s resend cooldown** (`OTP_RESEND_COOLDOWN_SEC`).
- The provider only **delivers** the SMS. If the provider call fails, the challenge is **deleted** and the API answers `502` — no fake success, no “verify a code that was never sent”.
- Phone numbers normalized to a 10-digit Indian mobile (`+91 98765 43210`, `09876543210`, `91-98765-43210` all → `9876543210`); responses mask the number (`+91 98765•••••`).

### Rate limits / abuse protection

| Limit | Default | Env var |
|---|---|---|
| OTP requests per phone / hour | 5 | `OTP_REQ_PER_PHONE` |
| OTP requests per IP / hour | 20 | `OTP_REQ_PER_IP` |
| OTP verify attempts per phone / 15 min | 10 | `OTP_VERIFY_PER_PHONE` |
| OTP verify attempts per IP / 15 min | 30 | `OTP_VERIFY_PER_IP` |
| Resend cooldown per phone | 30 s | `OTP_RESEND_COOLDOWN_SEC` |
| Password logins per IP+id / 15 min | 5 | `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MIN` |
| Registrations per IP / hour | 10 | `REGISTER_PER_IP` |
| Google sign-in attempts per IP / 10 min | 10 | fixed (10) |

Each limiter instance has its own bucket namespace (a bug where two per-IP limiters shared one budget was found and fixed during testing).

> The limiter is in-memory and per-process. For **multi-instance** production, move it to Redis (e.g. `rate-limit-redis`) keeping the same middleware signature in `backend/lib/rateLimit.js`.

### MSG91 setup (steps you must do manually)

1. Create an account at **msg91.com** → complete KYC for Indian transactional SMS.
2. **DLT registration** (TRAI mandate, via the MSG91 dashboard which walks you through it):
   - **Header/sender ID** (6 chars, e.g. `NILAAR`) — approve your brand entity.
   - **Content template** for OTP, e.g. `Your Nilaara login OTP is <#>######. Valid for 5 minutes. Do not share it with anyone.` — the variable receives our server-generated code. Note the **template ID**.
3. Add **SMS credits** (OTP is transactional; pricing per SMS; MSG91 has a free tier to test).
4. Backend `.env`:
   ```
   OTP_PROVIDER=msg91
   MSG91_AUTH_KEY=<Authkey from MSG91 dashboard>
   MSG91_TEMPLATE_ID=<DLT template id>   # optional — omit to use MSG91's own default OTP template
   MSG91_SENDER_ID=MSGIND                # optional — DLT header (MSGIND = MSG91's default)
   MSG91_COUNTRY_CODE=91
   OTP_HASH_SECRET=<openssl rand -hex 32>   # REQUIRED in production
   ```
5. Restart the backend. `POST /api/auth/otp/request` now texts real users.

### Twilio alternative (steps)

1. Twilio account → get **Account SID / Auth Token** and an SMS-capable number.
2. For Indian traffic: complete **DLT registration** for the sender (Twilio documents this under “DLT for India”) and register the exact SMS body.
3. Backend `.env`:
   ```
   OTP_PROVIDER=twilio
   TWILIO_ACCOUNT_SID=AC…
   TWILIO_AUTH_TOKEN=…
   TWILIO_FROM_NUMBER=+1…             # DLT-provisioned for India
   TWILIO_SMS_TEMPLATE=Your Nilaara login OTP is {{code}}. Valid for 5 minutes. Do not share it with anyone.
   OTP_HASH_SECRET=<openssl rand -hex 32>
   ```

Provider credentials live **only** in `backend/.env` (never in the frontend, never in the browser bundle).

### 2Factor.in setup (steps you must do manually — current default)

1. Create an account at **2factor.in** → complete KYC for Indian transactional SMS.
2. Register your **DLT header/sender ID** (6 chars, e.g. `NILAAR`) and an **OTP content template** (e.g. `Your Nilaara login OTP is <#>######. Valid for 5 minutes.`) in the 2Factor dashboard (or directly on DLT; 2Factor walks you through it).
3. Note your **API key** from the dashboard (API section).
4. Backend `.env`:
   ```
   OTP_PROVIDER=twofactor
   TWOFACOR_API_KEY=<key from the 2Factor dashboard>
   TWOFACOR_TEMPLATE=<approved SMS template name>   # required; "auto"/empty can be delivered as a voice call
   OTP_HASH_SECRET=<openssl rand -hex 32>   # REQUIRED in production
   ```
5. Restart the backend. `POST /api/auth/otp/request` now texts real users.

Integration detail: `TWOFACOR_TEMPLATE` must name an approved SMS template — 2Factor silently delivers unmatched/"auto" templates as **voice calls**, so the backend refuses to start without a template name. The server generates the code itself (CSPRNG), stores only its HMAC hash, then hands it to 2Factor's **pre-generated-OTP** endpoint for delivery. If the provider call fails, the challenge is deleted and the API answers `502` — the same honesty guarantees as every other provider.

### Email OTP via Resend

Email OTP is a **separate login method** from mobile OTP, sharing the same TTL/attempt/cooldown configuration but a different HMAC purpose (`"email"`), so an SMS code can never be replayed as an email code or vice-versa.

Setup:

1. Create an account at **resend.com** → **Domains** → add and verify your sending domain (SPF/DKIM DNS records; Gmail/Outlook domains are not allowed — use your store's own domain, e.g. `mail.nilaara.com` or `nilaara.com`).
2. Create an **API key** (Sending API).
3. Backend `.env`:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   RESEND_FROM=Nilaara Jewellers <otp@yourdomain.com>
   ```
4. Restart the backend. `POST /api/auth/email/otp/request` (`503` when unset) now emails real codes.

Security properties (all covered by tests): the response only ever returns the **masked** address (`a***@gmail.com`); the code lives in `OtpChallenge` as an HMAC hash only; single-use; 5 wrong attempts lock it; resend cooldown enforced; provider failure deletes the challenge and answers `502` (never a fake "sent"); an existing account with that email is reused, otherwise a plain `customer` is created — **email OTP can never produce a privileged account**.

### Test-only mock provider

`OTP_PROVIDER=mock` captures codes in process memory for the integration tests. It is **rejected at startup when `NODE_ENV=production`** and also refuses at call time. The unconfigured case answers `503` (never fake success).

---

## 3. Google Sign-In setup

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → OAuth consent screen** (External; add scope `email`, `profile`; add yourself as a test user while in Testing mode).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - **Authorized JavaScript origins**: `http://localhost:5173`, `https://yourdomain.com`
   - (Authorized redirect URIs are not needed for the Identity Services button flow, but adding your domain is harmless.)
3. Copy the client ID (`…apps.googleusercontent.com`) into:
   - `backend/.env` → `GOOGLE_CLIENT_ID=…`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID=…` (public by design; the button is hidden if unset)

### Server-side verification & linking policy

- The browser sends only the raw `credential` (ID token). The backend verifies it with Google's official **`google-auth-library`** (`verifyIdToken`) — **signature, audience (`GOOGLE_CLIENT_ID`), issuer, expiry** — then additionally requires `email_verified`. Email/name/user-id/role from the frontend are never trusted.
- Accounts key on Google's stable **`sub`** (stored as unique sparse `googleId`).
- Linking rules (`backend/lib/google.js → planAccount`, a pure unit-tested function):
  - Known `sub` → sign in to that account.
  - Verified email matches an existing **customer** → link Google to it (no takeover: `email_verified` is required).
  - Email belongs to **admin/staff** → `403` (privileged accounts use passwords only).
  - Email already tied to a **different** `sub` → `409`.
  - Otherwise → create a new account with hardcoded `role: "customer"`.
- **Google sign-in can never grant, preserve, or elevate admin rights.** The API has no admin bootstrap at all; the first admin comes from `npm run create-admin`.

---

## 4. Sessions & security model

- **Session cookie** `nilaara_sid`: `httpOnly`, `SameSite` from `COOKIE_SAMESITE` (`lax` by default, `strict`/`none` on request), `Secure` in production (forced — the app refuses to boot with `COOKIE_SECURE=false` in prod), `path=/`. The deployed storefront proxies `/api/*` through its own origin (`frontend/vercel.json`), so the cookie is first-party and `lax` is correct. A cross-site cookie — even `SameSite=None; Secure` — is dropped by Safari and every iOS browser, so `none` is only for clients that call the API cross-site directly.
- Token = 256-bit random value; server stores only its **SHA-256 hash** (`Session` collection, TTL-indexed). Rotation on **every** login (fixation defence); logout deletes the record server-side, so a stolen cookie dies immediately.
- **CSRF**: layered — a `SameSite` cookie plus an Origin check (`backend/lib/csrf.js`) on every state-changing `/api` request: a browser Origin that isn't `FRONTEND_URL`/`PUBLIC_BASE_URL` gets `403`. Requests without an Origin header (curl, server-to-server) pass.
- **Passwords**: bcrypt (`BCRYPT_ROUNDS=12`), timing-equalized unknown-user path, always generic `401 "Invalid credentials."`.
- **Validation**: Zod schemas on every auth body; unknown fields stripped; phone normalized before use.
- **Roles**: `customer` < `staff` < `admin`. Public endpoints can only create customers; Google/OTP hardcode `customer`. Admin routes are server-enforced (`requireRole`) — frontend hiding is cosmetic.
- **Browser storage**: only a *mirror* of the public profile (`nilaara-user` in localStorage, for instant UI paint). No passwords, no tokens — the session is the httpOnly cookie. Any 401/403 clears it.
- **CSRF + cookie note**: no token in JS-readable storage is needed because of SameSite + Origin checks.

---

## 5. Environment variables

### Backend (`backend/.env`) — new/related

```
# Sessions
SESSION_TTL_DAYS=7
BCRYPT_ROUNDS=12
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MIN=15
REGISTER_PER_IP=10
COOKIE_SECURE=true                # forced true in production
COOKIE_SAMESITE=none              # none (different sites, e.g. Vercel ↔ api.example.com) | lax | strict

# Google
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com

# Mobile OTP — pick ONE provider
OTP_PROVIDER=twofactor            # twofactor (default) | msg91 | twilio | (empty = OTP off)
TWOFACOR_API_KEY=                 # 2Factor.in API key
TWOFACOR_TEMPLATE=                # approved SMS OTP template name (required)
# — or msg91 —
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
MSG91_SENDER_ID=
MSG91_COUNTRY_CODE=91
# — or twilio —
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
TWILIO_SMS_TEMPLATE=Your Nilaara login OTP is {{code}}. Valid for 5 minutes. Do not share it with anyone.

# Email OTP (Resend) — optional, independent of SMS
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=Nilaara Jewellers <otp@yourdomain.com>

# required in production when OTP (SMS or email) is on:
OTP_HASH_SECRET=                  # openssl rand -hex 32
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SEC=30
OTP_REQ_PER_PHONE=5
OTP_REQ_PER_IP=20
OTP_VERIFY_PER_PHONE=10
OTP_VERIFY_PER_IP=30

# Dev seed accounts (scripts/seed-test-accounts.js — see section 6a)
# SEED_CUSTOMER_EMAIL=customer@nilaara.test   # dev fallbacks exist; override in shared envs
# SEED_CUSTOMER_PASSWORD=Customer@12345
# SEED_ADMIN_EMAIL=admin@nilaara.test
# SEED_ADMIN_PASSWORD=Admin@123456
```

Validation rules (`config/env.js`, fail-fast at boot): `twofactor` requires `TWOFACOR_API_KEY`; MSG91 requires the auth key (template ID optional — without it MSG91 uses its own default OTP template); Twilio requires SID/token/number; Resend requests fail with `502` (challenge deleted) until `RESEND_API_KEY` is set, and the request endpoint itself answers `503` when unset; `OTP_PROVIDER=mock` is refused in production; `GOOGLE_CLIENT_ID` must end in `.apps.googleusercontent.com`; `OTP_TTL_SECONDS` 60–900; `OTP_MAX_ATTEMPTS` 3–10; missing `OTP_HASH_SECRET` in prod fails startup.

### Frontend (`frontend/.env`)

```
VITE_API_URL=http://localhost:5000   # backend origin (required for real auth)
VITE_GOOGLE_CLIENT_ID=               # same public client ID; empty hides the Google button
```

---

## 6. Where auth is integrated (frontend)

- **Header**: cart badge + avatar/initials account menu (*Profile / My Orders / Wishlist / Log out*); guests get a **Log in** pill (mobile drawer too). Both the header and the mobile menu link to `/login?next=<current path>`.
- **`/login`**: three tabs — **Mobile (OTP)** (default, two-step flow with masked number and resend countdown synced to the server's `retryAfterSec`), **Email (OTP)** (Resend; masked address, resend countdown, "Change address", spam-folder hint), and **Password**; plus the Google button; redirect via `?next=`.
- **`/register`**: email + password + Google signup; links to both OTP sign-ins.
- **`/account`**: profile edit (name/email — server-verified, duplicate → 409), sign-in method badges (mobile verified / email verified / Google linked), **Google account linking**, own order history from `GET /api/orders/mine`, logout.
- **Login gate**: guests who try to **add to bag**, **check out**, or open **My Orders** get a clean login dialog (or a `/login?next=…` redirect on checkout/orders pages). The intended action is persisted (`nilaara-pending-action` in localStorage) and **replayed after sign-in** — an attempted add-to-cart lands the item in the bag with a confirmation toast; a checkout intent navigates straight to `/checkout`.
- **Cart**: server-side and persistent per account (`/api/cart`); a leftover guest cart is **merged once** right after login (capped at stock). The bag survives refreshes and device changes; out-of-stock/unpublished adds surface as toasts, never silent failures.
- **Checkout**: three steps (Review → Delivery → Payment) with progress persisted in sessionStorage; totals recalculated by `POST /api/orders/preview`; delivery fees/ETAs and COD/Razorpay availability come from `GET /api/settings` only; Razorpay retries reuse the same shop order (no duplicates) and the order is only marked paid after server signature verification.
- **`/orders`**: Live/Old tabs over real MongoDB statuses (`GET /api/orders/mine?view=`), own orders only, expandable details with status-history timeline and delivery address.
- **Wishlist / Track**: Track accepts `?id=` deep links from My Orders; guest lookup by phone kept for legacy guest orders.
- **Admin**: existing page already guards on `role`; Google/OTP sessions can never pass it (server-side `requireRole` too).

### 6a. Seed test accounts (development)

```powershell
cd backend
npm run seed:accounts
```

Creates **one test customer** (`customer@nilaara.test` / `Customer@12345` by default) and **one admin** (`admin@nilaara.test` / `Admin@123456`) for local development, so you don't have to promote a user by hand. Guarantees:

- **Refuses to run in production** (also blocked via the `isProd` guard the CLI passes when `NODE_ENV=production`).
- Credentials overridable via `SEED_CUSTOMER_EMAIL`, `SEED_CUSTOMER_PASSWORD`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`; dev-only fallbacks above apply when unset.
- **Never overwrites** an existing user by email and **never changes an existing user's role** — it only reports what already exists.
- The admin role is assigned **by the server script**, never via an API call or the browser.

---

## 7. Running the tests

```powershell
cd backend
npm test          # node --test — full suite (97 tests)
```

Relevant files:

- `test/otp.test.js` — phone normalization, CSPRNG codes, hashing, constant-time verify, expiry, attempts, masking.
- `test/googlePolicy.test.js` — linking policy (customer-only creation, staff/admin refusal, different-sub conflict, no privilege patch) + garbage-token rejection.
- `test/auth.integration.test.js` — **real HTTP against the real app + in-memory MongoDB**: register (role ignored), password login (generic 401s), phone login, logout (server-side revocation), `PATCH /me`, OTP happy path (masked response, hashed at rest), wrong code / expired / lockout / replay / resend cooldown / per-phone limiter, invalid Google token, CSRF origin guard, customer vs admin routes, `/orders/mine` isolation, OTP-never-admin.
- `test/cart.checkout.test.js` — cart CRUD (guests 401 everywhere, server-priced items, stock caps, merge), login-required checkout (guest 401, server-computed totals, cart cleared, state/notes saved), `POST /api/orders/preview` (server recalc, no order created, unknown method 400), configured delivery methods + free-shipping threshold, `orders/mine?view=live|old` split by real statuses, **email OTP** (masked response, hashed at rest, wrong/correct/replay/cooldown/expiry/lockout, account linking, never-admin), seed script (no overwrite, no role change, production refusal).
- `test/app.test.js` — 503s when OTP/Google/Resend unconfigured, CSRF, unauthenticated 401s (including cart & checkout).

```powershell
cd frontend
npm run build     # production build must succeed
npm run lint      # oxlint — no errors; only pre-existing pattern warnings
```

**Test results at time of writing:** backend **97/97 pass**; frontend build ✓; lint exit 0 (remaining warnings are pre-existing in old files / tolerated patterns).

---

## 8. Manual checklist (needs real credentials — not covered by tests)

- [ ] **2Factor.in** (or MSG91/Twilio) account, DLT header + OTP template, credits; set backend env → send yourself a real OTP end-to-end.
- [ ] **Resend** domain verified (SPF/DKIM) + API key; set env → email yourself a real OTP end-to-end; check spam/promotions delivery.
- [ ] Google OAuth web client → set both env vars → sign in with a real Google account; verify account linking from an existing password account.
- [ ] **Razorpay** test keys + webhook secret → pay with a test card/UPI; verify the order flips to *paid* only after server verification; test the webhook path; confirm a failed payment does NOT mark the order paid.
- [ ] `OTP_HASH_SECRET` generated for production; `COOKIE_SECURE=true` (enforced) behind HTTPS.
- [ ] Multi-instance deploy → swap `lib/rateLimit.js` for a Redis-backed limiter.
- [ ] Confirm `FRONTEND_URL` (and `PUBLIC_BASE_URL`) match the real site origin, or CSRF Origin checks will reject the browser's POSTs.

## 9. Dependencies added

```powershell
cd backend
npm install google-auth-library twilio        # google-auth-library: official token verification; twilio: optional provider
npm install --save-dev mongodb-memory-server  # in-memory MongoDB for integration tests
```

`google-auth-library` and `twilio` are loaded lazily (only when that provider is used), so installs are the only cost when disabled. The **2Factor.in** and **Resend** drivers use Node's built-in `fetch` — **no extra SDK dependency**.
