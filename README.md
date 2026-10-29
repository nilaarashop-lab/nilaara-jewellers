# ✦ Nilaara Jewellers — Artificial & Gold-Plated Jewellery

Premium light-theme e-commerce modelled on rubans.in — built with **Vite + React** (frontend) and **Express + MongoDB Atlas** (backend), with **ImageKit / Cloudinary** image hosting and Razorpay-ready payments.

## Structure

```
parinaya-jewels/          # folder name kept to avoid breaking existing paths/data
  frontend/               # Vite React store (Home, Shop, Product, Cart, Checkout, Track, Admin)
  backend/                # Express + Mongoose API (auth, products, images, orders, payments)
  docs/                   # API + Cloudinary + deployment guides
```

> The customer-facing brand is **Nilaara Jewellers**. The repository folder, database name and existing product IDs (e.g. `par-ethnic-kundan-choker`) still use the old naming so current data and URLs keep working. New products created in the admin panel use `nilaara-…` IDs.

### Branding assets

- `frontend/public/Nilaara.png` — original logo
- `frontend/public/nilaara-mark.png` — cropped lotus mark (header + broken-image fallback)
- `frontend/public/nilaara-logo.png` — resized full logo (footer)
- `frontend/public/favicon.png` — favicon

## Quick start

### 1. Backend

```powershell
cd backend
npm install
Copy-Item .env.example .env    # then edit — see "Environment variables" below
npm run seed                   # optional — seeds 5 demo products (idempotent)
npm run seed:accounts          # optional (dev) — one test customer + one test admin
npm run dev                    # → http://localhost:5000/api/health
```

Create the first administrator (the only way an admin account can be created — the API never allows admin self-registration):

```powershell
npm run create-admin -- --email=you@example.com --password=ChooseAStrongPass --name="Your Name"
```

For local development you can instead run `npm run seed:accounts`, which creates `customer@nilaara.test` / `Customer@12345` and `admin@nilaara.test` / `Admin@123456` (overridable via `SEED_*` env vars). It **refuses to run in production**, never overwrites existing users and never changes anyone's role.

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev                    # → http://localhost:5173
```

To connect frontend ↔ backend, create `frontend/.env`:

```
VITE_API_URL=http://localhost:5000
```

Without `VITE_API_URL` the site runs in **demo mode** (built-in catalogue, no server, demo-only auth). With it set, **all** data comes from MongoDB and API failures surface as errors — the app never silently falls back to demo products.

### 3. Tests

```powershell
cd backend
npm test        # 106 tests: auth (password/OTP/Google policy, email OTP, sessions, CSRF, rate limits), server cart, login-required checkout, orders/mine filters, image verification, URL allow-list, pricing, order workflow, Razorpay signatures, app security routes, seed script, homepage settings, ImageKit config
```

## Image storage (ImageKit or Cloudinary)

All **new** product and homepage images are uploaded through the admin panel → backend → the configured image provider (`STORAGE_DRIVER`: `imagekit` | `cloudinary` | `local`). Nothing is written to the server's disk and no binary data is stored in MongoDB — only `{url, publicId, alt}` references.

- Uploads require an admin/staff session.
- Allowed types: JPEG, PNG, WebP, GIF — verified by **magic bytes**, not the client-declared MIME type.
- 5 MB per image, 6 images per request (configurable).
- Assets live in the `nilaara/products` folder with unique public IDs (ImageKit: the returned `fileId`).
- Deleting/replacing an image only removes the stored asset when **no other product and no order** still references it.

Full guides: [docs/IMAGEKIT.md](docs/IMAGEKIT.md) (this project's current setup) and [docs/CLOUDINARY.md](docs/CLOUDINARY.md) — including how to get credentials and how to migrate existing images.

## Environment variables (`backend/.env`)

See `backend/.env.example`. Highlights — **never commit real values** (`.env` is git-ignored):

```
MONGO_URI=mongodb+srv://…            # required in production (Atlas)
FRONTEND_URL=http://localhost:5173   # CORS origin(s), comma separated
NODE_ENV=development

STORAGE_DRIVER=imagekit              # imagekit | cloudinary | local
# ImageKit — dashboard → Developer Options → API Keys → Private Key
IMAGEKIT_PRIVATE_KEY=                # server-side only — never sent to React
# Optional: IMAGEKIT_PUBLIC_KEY / IMAGEKIT_URL_ENDPOINT (custom CDN CNAME)
# Cloudinary (when STORAGE_DRIVER=cloudinary):
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=               # server-side only — never sent to React
MAX_UPLOAD_MB=5
MAX_UPLOAD_FILES=6

# Sessions (httpOnly cookies; COOKIE_SECURE=true is forced in production)
SESSION_TTL_DAYS=7
BCRYPT_ROUNDS=12
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MIN=15

# Google Sign-In (optional — button hides when unset)
GOOGLE_CLIENT_ID=                  # …apps.googleusercontent.com (same value as frontend VITE_GOOGLE_CLIENT_ID)

# Mobile OTP via a real SMS provider (optional — see docs/AUTH.md)
# OTP_PROVIDER=twofactor            # twofactor (2Factor.in, default) | msg91 | twilio | empty = OTP off
# TWOFACOR_API_KEY=                 # 2Factor.in API key
# TWOFACOR_TEMPLATE=auto
# — or MSG91: MSG91_AUTH_KEY= / MSG91_TEMPLATE_ID= / MSG91_SENDER_ID=
# OTP_HASH_SECRET=                 # REQUIRED in production when OTP is on

# Email OTP via Resend (optional — "Email (OTP)" tab on the login page)
# RESEND_API_KEY=re_xxxxxxxx       # from resend.com (verify your own sending domain)
# RESEND_FROM=Nilaara Jewellers <otp@yourdomain.com>

# Razorpay (optional — COD works without these; checkout then shows only COD)
# RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
# RAZORPAY_KEY_SECRET=xxxxxxxxxxxx
# RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx

# Dev seed accounts (npm run seed:accounts — never runs in production)
# SEED_CUSTOMER_EMAIL= / SEED_CUSTOMER_PASSWORD= / SEED_ADMIN_EMAIL= / SEED_ADMIN_PASSWORD=
```

## Customer authentication

Three sign-in methods, all producing the same secure server-side session (httpOnly, `SameSite=Lax`, Secure-in-production cookie; token rotated on every login; Origin-checked CSRF):

- **Mobile OTP** (default tab on the login page) — real SMS via **2Factor.in** (default) or **MSG91**/**Twilio** alternatives; codes are CSPRNG-generated, HMAC-hashed at rest, expire in 5 min, single-use, attempt-limited and never returned by the API.
- **Email OTP** — real emails via **Resend**; same TTL/attempt/cooldown hardening with a separate HMAC purpose, so an SMS code can never verify as an email code (and vice versa). Responses only ever show the masked address.
- **Google Sign-In** — Identity Services on the frontend, verified with Google's official `google-auth-library` on the backend (signature/audience/issuer/expiry). Linking is keyed on Google's stable `sub`; **Google login can never create or access admin accounts**.
- **Email + password** — bcrypt, generic errors, timing-equalized, rate-limited.

**Login is required to add to the bag, check out and view My Orders** — guests get a clean login dialog, their intended action is saved and replayed right after sign-in. Setup steps for every provider, all env vars, and the security model: **[docs/AUTH.md](docs/AUTH.md)**.

## Cart, checkout & orders

- **Server-side cart** — one persistent cart per account in MongoDB (`/api/cart`); products, prices and stock are always resolved server-side; quantities are capped at stock; a leftover guest cart is merged once after login; the bag survives refreshes and device changes.
- **Multi-step checkout** (`/checkout`) — Review → Delivery → Payment with a progress indicator; totals recalculated by the server (`POST /api/orders/preview`) after every change; Indian PIN/state validation; delivery methods (fees + ETAs) come only from configured settings; progress survives a refresh (sessionStorage).
- **Payments** — COD (configurable) and **Razorpay** (server-created provider order for the server-computed amount, HMAC signature verification before an order is ever marked paid, idempotent webhooks, safe retries without duplicate orders).
- **My Orders** (`/orders`) — Live (placed/packed/shipped) and Old (delivered/cancelled/returned/refunded) tabs over real order statuses; own orders only, scoped by the session on the server; expandable details with status history, delivery address and ETA.

## Migrating existing product images

```powershell
cd backend
npm run migrate-images -- --dry-run            # report only, nothing changes
npm run migrate-images                          # upload local /uploads files → Cloudinary
npm run migrate-images -- --import-external     # additionally re-host external (e.g. Unsplash) URLs
```

The script backs up every product document first, is safe to re-run (already-migrated images are skipped), writes a JSON report, and **never deletes the original files**. Details: [docs/CLOUDINARY.md](docs/CLOUDINARY.md#migrating-existing-images).

## Razorpay — when you're ready (no rebuild needed)

1. Sign up at razorpay.com → get **Test keys** (then Live keys when you launch).
2. In `backend/.env` add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
3. Restart the backend. Checkout immediately shows the Razorpay option (the frontend learns availability from `GET /api/settings` — no rebuild). Provider orders are created server-side for the server-computed amount; an order is marked **paid only after HMAC signature verification** (checkout verify call or verified webhook, idempotent); the browser can never choose an amount or report success. Until keys are configured, payment routes return 503 and checkout stays COD-only. Deployment notes: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Features (Rubans-style)

- Announcement bar (B1G1 + Flat 25%), sticky header, search, category nav
- Hero + side promos, trust badges, circular categories, handpicked collections
- Best-sellers grid (ratings, MRP strike, % off, price, wishlist, add-to-cart)
- Festive countdown banner, reviews, Instagram strip, newsletter, rich footer
- Cart drawer with free-shipping progress + B1G1/FLAT25 coupons
- Shop filters (category, collection, price, sort, search), product page (gallery, pincode, care accordion, related), wishlist, success + track-order pages
- **Server-side cart** with login gate (bag icon with count badge; guests get a login dialog and their action is replayed after sign-in)
- **Multi-step checkout** (`/checkout`): order review with server-recalculated totals → delivery details (Indian PIN/state validation, configured shipping methods with fees + ETAs) → payment (COD / Razorpay with server-side verification) → success page (order number, summary, My Orders button; motion respects `prefers-reduced-motion`)
- **My Orders** (`/orders`): Live/Old tabs from real order statuses, status & payment pills, expandable details with status-history timeline, own orders only
- **Admin CMS** (`/admin`): server-side login, dashboard stats, product CRUD with Cloudinary image upload (preview/progress/remove/replace), order management with a controlled status workflow
- **Customer accounts** (`/login`, `/register`, `/account`): Google Sign-In, mobile OTP login (real SMS via 2Factor.in), email OTP login (Resend), email+password, resend countdowns, `?next=` redirect back to the requested page, profile editing, sign-in-method badges, own order history, logout, avatar menu in the navbar (Profile / My Orders / Wishlist / Log out)

## Fonts & theme

- Display: **Cormorant Garamond** (serif) · Body: **Jost** (sans)
- Light premium palette: ivory `#FFFCF6`, gold `#B08D3E`, bronze ink `#3A2A1E`

## Further reading

- [docs/API.md](docs/API.md) — API reference
- [docs/AUTH.md](docs/AUTH.md) — customer authentication (2Factor.in SMS OTP, Resend email OTP, Google, sessions, seed accounts, provider setup)
- [docs/CLOUDINARY.md](docs/CLOUDINARY.md) — image storage, credentials, migration
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production deployment checklist
- [docs/VERCEL.md](docs/VERCEL.md) — deploying and updating the storefront on Vercel
