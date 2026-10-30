# ✦ Nilaara Jewellers — Artificial & Gold-Plated Jewellery

A premium light-theme **catalogue storefront** — customers browse the collection and every order is completed on **WhatsApp**. Built with **Vite + React** (frontend) and **Express + MongoDB Atlas** (backend), with **ImageKit / Cloudinary** image hosting and a staff-only admin panel.

## How ordering works

There is no customer account, cart or checkout. Each product card and product page has a **Buy Now** button that opens WhatsApp with a pre-filled message containing the product name, **product ID**, price, category and a link to the piece. The customer attaches a screenshot and sends their name, phone, address and pincode; the team confirms availability and books the order in chat.

- The WhatsApp number lives in **one place**: `frontend/src/config.js` (`WHATSAPP_NUMBER` / `WHATSAPP_DISPLAY`). Change it there before launch — the placeholder is `+91 98XXXXXXXX`.
- The wishlist is a local "save for later" list (`localStorage`), no sign-in needed.
- Staff still sign in at `/admin` to manage products, images, homepage content and orders.

## Structure

```
parinaya-jewels/          # folder name kept to avoid breaking existing paths/data
  frontend/               # Vite React catalogue (Home, Shop, Product, Wishlist, About, Contact, Stores, Admin)
  backend/                # Express + Mongoose API (products, images, settings, staff auth, legacy order routes)
  docs/                   # API + Cloudinary + deployment guides
```

> The backend still exposes the older customer-auth / cart / checkout / Razorpay endpoints so existing data and tests keep working, but **the storefront no longer calls them**. New work should treat the catalogue + WhatsApp flow as the supported path.

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

Without `VITE_API_URL` the site runs in **demo mode** (built-in catalogue, no server). With it set, **all** data comes from MongoDB and API failures surface as errors — the app never silently falls back to demo products.

### 3. Tests

```powershell
cd backend
npm test        # backend suite (auth, sessions, orders, pricing, image verification, URL allow-list, settings, ImageKit config)
```

> The suite still covers the legacy customer auth/cart/checkout endpoints. Those routes remain in the API for existing data, but the storefront UI no longer uses them.

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

# Google Sign-In (optional — legacy customer auth only; unused by the storefront)
GOOGLE_CLIENT_ID=                  # …apps.googleusercontent.com

# Mobile OTP via a real SMS provider (legacy customer auth — see docs/AUTH.md)
# OTP_PROVIDER=twofactor            # twofactor (2Factor.in, default) | msg91 | twilio | empty = OTP off
# TWOFACOR_API_KEY=                 # 2Factor.in API key
# TWOFACOR_TEMPLATE=auto
# — or MSG91: MSG91_AUTH_KEY= / MSG91_TEMPLATE_ID= / MSG91_SENDER_ID=
# OTP_HASH_SECRET=                 # REQUIRED in production when OTP is on

# Email OTP via Resend (legacy customer auth)
# RESEND_API_KEY=re_xxxxxxxx       # from resend.com (verify your own sending domain)
# RESEND_FROM=Nilaara Jewellers <otp@yourdomain.com>

# Razorpay (legacy checkout only — the storefront has no payment step)
# RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
# RAZORPAY_KEY_SECRET=xxxxxxxxxxxx
# RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx

# Dev seed accounts (npm run seed:accounts — never runs in production)
# SEED_CUSTOMER_EMAIL= / SEED_CUSTOMER_PASSWORD= / SEED_ADMIN_EMAIL= / SEED_ADMIN_PASSWORD=
```

## Staff authentication (admin only)

Customers never sign in. The panel at `/admin` uses one server-side session (httpOnly, `SameSite=Lax`, Secure-in-production cookie; token rotated on every login; Origin-checked CSRF) with email + password, bcrypt, generic errors, rate limiting and attempt windows.

- Create the first administrator with `npm run create-admin` (above); the API never allows admin self-registration.
- The session is only checked when `/admin` mounts — catalogue pages make no auth request at all.
- Legacy customer sign-in methods (mobile OTP, email OTP, Google, customer password) still exist in the backend and are documented in [docs/AUTH.md](docs/AUTH.md), but are not linked from the storefront.

## WhatsApp ordering

- **Buy Now** on every card and product page opens `wa.me` with a short message built by `productEnquiryMessage()` in `frontend/src/config.js`:
  `Hi Nilaara Jewellers! I'd like to buy this product.` / `Product: <name>` / `Product ID: <id>`.
  Price, availability, payment and shipping are then handled by the WhatsApp Business auto-reply.
- Header, footer and contact-page links open a general chat with the same number.
- Product pages show the **Product ID** prominently (so it can be quoted even from a screenshot) plus care/shipping accordions.
- **Staff set the product ID** per product in the admin panel (`/admin` → Add / Edit product → *Product ID*). It is normalised to lower-case with dashes, must be unique, and becomes the `/product/<id>` URL.
- Sold-out products show a disabled button instead of a WhatsApp link.
- The contact form does not post to a server — it composes the message and opens WhatsApp.

To change the number, edit **only** `frontend/src/config.js`:

```js
export const WHATSAPP_NUMBER = "919800000000"; // digits only, country code first
export const WHATSAPP_DISPLAY = "+91 98XXXXXXXX";
```

## Migrating existing product images

```powershell
cd backend
npm run migrate-images -- --dry-run            # report only, nothing changes
npm run migrate-images                          # upload local /uploads files → Cloudinary
npm run migrate-images -- --import-external     # additionally re-host external (e.g. Unsplash) URLs
```

The script backs up every product document first, is safe to re-run (already-migrated images are skipped), writes a JSON report, and **never deletes the original files**. Details: [docs/CLOUDINARY.md](docs/CLOUDINARY.md#migrating-existing-images).

## Legacy API surface (not used by the storefront)

The backend still implements the previous e-commerce features — customer accounts (password, mobile/email OTP, Google), server cart, checkout preview, orders and Razorpay — so old data, admin order views and the test suite keep working. **Nothing in the storefront calls them:**

- Retired UI routes redirect (`/login`, `/register`, `/account` → `/`; `/cart`, `/checkout`, `/success`, `/orders`, `/track` → `/shop`).
- Razorpay keys in `backend/.env` now only affect the legacy API/tests; there is no payment step in the UI.
- Order records created before the switch still appear in the admin panel.

Setup for those endpoints is documented in [docs/AUTH.md](docs/AUTH.md), [docs/API.md](docs/API.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Features

- Announcement bar, sticky header, live search, category nav
- Hero + side promos, trust badges, circular categories, handpicked collections
- Best-sellers grid (MRP strike, % off, price, wishlist heart, **Buy Now → WhatsApp**)
- Festive banner, reviews, Instagram strip, newsletter, rich footer
- Shop filters (category, collection, price, sort, search), product page (gallery, product ID, care accordions, related pieces), local wishlist
- **WhatsApp ordering**: short pre-filled message (name + product ID) so the WhatsApp Business auto-reply can send price and shipping details
- **Admin CMS** (`/admin`): staff login, dashboard stats, product CRUD with an admin-assigned **Product ID**, Cloudinary/ImageKit image upload (preview/progress/remove/replace), homepage/announcement editing, order management
- Legacy routes (`/login`, `/register`, `/account`, `/cart`, `/checkout`, `/success`, `/orders`, `/track`) redirect to `/` or `/shop` so old links and bookmarks still land somewhere useful

## Fonts & theme

- Display: **Cormorant Garamond** (serif) · Body: **Jost** (sans)
- Light premium palette: ivory `#FFFCF6`, gold `#B08D3E`, bronze ink `#3A2A1E`

## Further reading

- [docs/API.md](docs/API.md) — API reference
- [docs/AUTH.md](docs/AUTH.md) — sessions and the legacy customer auth endpoints (not used by the storefront UI)
- [docs/CLOUDINARY.md](docs/CLOUDINARY.md) — image storage, credentials, migration
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production deployment checklist
- [docs/VERCEL.md](docs/VERCEL.md) — deploying and updating the storefront on Vercel
