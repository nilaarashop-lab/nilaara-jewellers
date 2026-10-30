# Deployment Guide

## Prerequisites

- Node.js 18+ (tested on Node 24)
- A **MongoDB Atlas** cluster (free tier works) — production refuses to boot against `localhost`
- A **Cloudinary** account ([setup guide](CLOUDINARY.md))
- Your frontend hosted separately (Vercel / Netlify / any static host) or served behind the same domain

## 1. Backend environment

Production validation (`config/env.js`) **fails fast** — the server exits with a clear message instead of starting insecurely. Required in production:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | Atlas connection string (localhost is rejected) |
| `STORAGE_DRIVER` | `cloudinary` (local disk is rejected) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | from the Cloudinary dashboard |
| `FRONTEND_URL` | the exact origin(s) of your React app, comma-separated — CORS allows only these, with credentials. Must be `https://` origins in production (trailing slashes are stripped) |
| `COOKIE_SECURE` | `true` (forced in production; sessions are httpOnly) |
| `COOKIE_SAMESITE` | `none` when the storefront and the API are on different sites (default in production, needs `COOKIE_SECURE=true`); `lax` when both share one registrable domain |

Optional:

```
PUBLIC_BASE_URL=https://api.nilaara.com    # absolute API URL
RAZORPAY_KEY_ID=…  RAZORPAY_KEY_SECRET=…  RAZORPAY_WEBHOOK_SECRET=…
SESSION_TTL_DAYS=7  BCRYPT_ROUNDS=12  LOGIN_MAX_ATTEMPTS=5  LOGIN_WINDOW_MIN=15
COOKIE_SAMESITE=lax                         # only when the storefront and API share a registrable domain
MAX_UPLOAD_MB=5  MAX_UPLOAD_FILES=6
ALLOWED_IMAGE_HOSTS=                        # empty in production: new images must come from uploads
TRUST_PROXY=1                               # behind a reverse proxy / load balancer
PORT=5000
```

The API secret and Razorpay secrets live **only** here — never in the frontend, never in a `VITE_*` variable.

## 2. Deploy the backend

```powershell
cd backend
npm ci                       # reproducible install from package-lock.json
npm run create-admin -- --email=you@example.com --password=… --name="…"
npm start                    # node server.js — validates env, connects MongoDB, listens
```

Process manager options: PM2 (`pm2 start server.js --name nilaara-api`), Windows NSSM, or a container. The server:

- exits non-zero on invalid config or a failed MongoDB connection (no "runs without DB" silent mode),
- sets security headers via Helmet,
- restricts CORS to `FRONTEND_URL` with credentials enabled,
- serves legacy `backend/uploads/` images read-only so old records keep working — nothing new is ever written there.

Ensure HTTPS terminates at your proxy/host so `Secure` cookies work end-to-end.

## 3. Deploy the frontend

```powershell
cd frontend
npm ci
npm run build        # → dist/
```

Set the build-time variable:

```
VITE_API_URL=https://api.nilaara.com
```

Host `dist/` on Vercel/Netlify/etc. Notes:

- `VITE_API_URL` must be set at **build** time (Vite inlines it). Without it the app runs in demo mode — never deploy the storefront without it.
- Production builds request `/api/*` from their own origin; on Vercel the rewrite in `frontend/vercel.json` proxies those requests to `VITE_API_URL`'s host. Keep the two in sync — the same-origin hop is what keeps the session cookie first-party for Safari/iOS. Other hosts (Netlify) need an equivalent proxy.
- The API's `FRONTEND_URL` must exactly match the deployed origin (scheme + host, no trailing slash) or cookie-authenticated requests will be blocked by CORS.

## 4. Migrate existing images (one-time)

```powershell
cd backend
npm run migrate-images -- --dry-run
npm run migrate-images -- --import-external
```

See [CLOUDINARY.md](CLOUDINARY.md#migrating-existing-images) — the script backs up every product first, is safe to re-run, writes a report, and never deletes originals.

## 5. Razorpay go-live (optional)

1. Add the three Razorpay variables and restart.
2. Set the dashboard webhook URL to `https://api.nilaara.com/api/payments/razorpay/webhook` with the same `RAZORPAY_WEBHOOK_SECRET`.
3. Test with Razorpay test cards first; only verified signatures (checkout verify or webhook HMAC) mark an order paid, and webhook processing is idempotent.
4. Until configured, payment routes return `503` (no fake success); the storefront takes orders on WhatsApp instead.

## 6. Pre-launch checklist

- [ ] `npm test` passes in `backend/` (43 tests)
- [ ] `npm run build` succeeds in `frontend/`
- [ ] Production env validation passes (server starts, logs `storage: cloudinary`)
- [ ] `npm run create-admin` was run; you can log in at `/admin`
- [ ] `.env` is git-ignored and contains no real secrets in git history
- [ ] Cloudinary migration report shows 0 failed / 0 manual-attention products
- [ ] Test the WhatsApp flow end-to-end: open a product → Buy Now → WhatsApp opens with the product name + ID
- [ ] Unauthorized upload attempt returns 401 (`curl -X POST https://api…/api/upload`)
- [ ] HTTPS everywhere; `Set-Cookie` shows `HttpOnly` (+ `Secure`)
