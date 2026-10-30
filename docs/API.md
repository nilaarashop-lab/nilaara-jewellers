# Nilaara API Reference

> **Storefront status:** the website is now a **catalogue with WhatsApp ordering**. The React app only uses the product, settings, upload, staff-auth and admin endpoints. The customer auth / cart / checkout / order / Razorpay endpoints below still exist (for existing data, the admin panel and the test suite) but are **not called by the storefront UI**.

Base URL: whatever you set as the backend origin (e.g. `http://localhost:5000`). All endpoints are JSON unless noted.

## Conventions

- **Auth**: cookie-based. `POST /api/auth/login` sets an `httpOnly` session cookie; every subsequent request must send `credentials: "include"` (the frontend API client does this automatically). There are no bearer tokens and nothing sensitive is stored in browser storage.
- **Errors**: non-2xx responses return `{ "error": "human readable message" }`, optionally with `details` (Zod validation issues). Status codes: `400` validation, `401` not logged in, `403` logged in but forbidden, `404` not found, `409` conflict/state violation, `429` rate limited, `503` feature not configured.
- **Roles**: `admin` > `staff` > `customer`. Registration can only ever create customers; the first admin is created via `npm run create-admin`.

---

## Health

### `GET /api/health`
Public. Returns `{ ok, db, storage, payments }` where `db` is the MongoDB readyState (0 = disconnected) and `storage` is the active image driver (`cloudinary` in production).

---

## Auth — `/api/auth`

Full guide (providers, env vars, security model): [AUTH.md](AUTH.md).

### `POST /api/auth/login`
Body: `{ id, password }` — `id` is an email or a 10-digit phone (normalized server-side). Rate limited (5 attempts / 15 min per IP+id by default). Returns `{ user }` and sets the session cookie. Unknown user and wrong password both return the same generic `401`.

### `POST /api/auth/register`
Body: `{ name, email? , phone?, password }` (at least one of email/phone; password min 6). Always creates a **customer** — the role field in the body is ignored. Returns `201 { user }`.

### `POST /api/auth/otp/request`
Body: `{ phone }` (Indian mobile, any common format — normalized). **Requires a configured SMS provider** (`503` otherwise). Sends a real SMS; returns `{ ok, phone (masked), cooldown, expiresIn, maxAttempts }`. The code itself is **never** returned or logged. Throttled: per-phone and per-IP hourly limits plus a 30 s resend cooldown (`429` with `Retry-After` + `retryAfterSec`). Provider failure → challenge deleted, `502`.

### `POST /api/auth/otp/verify`
Body: `{ phone, otp }`. Verifies server-side against the HMAC-hashed code (constant time). Success → session cookie + `{ user }` (existing account for that phone is used; a new one is created as `customer`, `phoneVerified: true`) and the code becomes unusable. Failures: `400` wrong code (with attempts left), `429` expired/locked/over-limit.

### `POST /api/auth/email/otp/request`
Body: `{ email }`. **Requires `RESEND_API_KEY`** (`503` otherwise). Emails a 6-digit code through Resend and returns `{ ok, email (masked like a***@gmail.com), cooldown, expiresIn, maxAttempts }` — the code is **never** returned or logged. Uses its own rate-limit buckets (so SMS and email can't starve each other), enforces the resend cooldown (`429` + `retryAfterSec`), and deletes the challenge on provider failure (`502`).

### `POST /api/auth/email/otp/verify`
Body: `{ email, otp }`. Verified against an HMAC hash bound to purpose `"email"`, so an SMS code can never verify as an email code. Single-use; wrong/expired/locked codes fail exactly like the SMS flow. Success → session + `{ user }`: an existing account with that email is used (no duplicate), otherwise a `customer` with `emailVerified: true` is created. Email OTP can never create privileged accounts.

### `POST /api/auth/google`
Body: `{ credential }` — the raw Google Identity Services ID token. Verified with `google-auth-library` (signature/audience/issuer/expiry + `email_verified`). Result: sign-in, careful link to an existing **customer** by verified email, or creation of a new `customer`. `403` for staff/admin emails, `409` for an email tied to a different Google identity, `400` invalid token, `503` unconfigured. Google login can never grant admin rights.

### `POST /api/auth/google/link`
Authenticated. Attaches a Google identity to the **current** session's customer account (refuses staff/admin, duplicate subjects and foreign emails: `403`/`409`).

### `POST /api/auth/logout`
Destroys the server session and clears the cookie. Returns `{ ok: true }`.

### `GET /api/auth/me`
Returns `{ user }` for the current session, `401` if not logged in. Used by the frontend on boot to restore sessions.

### `PATCH /api/auth/me`
Authenticated. Body: `{ name?, email? }`. `409` when the email belongs to another account; changing email resets `emailVerified`.

---

## Products — `/api/products`

### `GET /api/products?cat=&col=&q=&page=&limit=`
Public. Returns published products only (legacy records without a `status` count as published) as an array — the same shape the storefront has always consumed (`images` is an array of URL strings). `q` is a literal (regex-escaped) name search. `X-Total-Count` header carries the total.

### `GET /api/products/:id`
Public for published products. Accepts the legacy id (`par-…`), the slug, or the Mongo `_id`. Drafts/archived products return `404` unless requested by an admin/staff session.

### `POST /api/products` — admin/staff
Zod-validated body; unknown fields are ignored, `role`-like escalation is impossible. `images` entries must be `{url, publicId, alt}` objects (or strings) whose URLs are HTTPS on an allow-listed host — in production that means Cloudinary only, so arbitrary pasted URLs cannot bypass the upload endpoint. Rejected entries fail the request with `400` and are listed in `details`. Returns `201` with the admin product shape.

`id` is optional: staff can set their own product ID (letters/numbers/dashes, normalised to lower-case-with-dashes — it becomes the `/product/:id` URL and the code quoted on WhatsApp). Blank auto-generates `nilaara-…`. A duplicate id/slug returns `409`.

### `PUT /api/products/:id` — admin/staff
Partial update (same schema, all fields optional). The document is saved **after** the new image set is validated; Cloudinary assets that were removed from the product and are referenced by nothing else (and no order) are then deleted best-effort. `id` may be changed (uniqueness enforced, `409` on clash) — the lookup itself also accepts the Mongo `_id`, so the admin UI can rename a product without losing the record.

### `DELETE /api/products/:id` — admin only
Deletes the product. Its images are removed from Cloudinary only when no other product and **no order snapshot** references them (orders keep their historical appearance).

---

## Uploads — `/api/upload`

### `POST /api/upload` — admin/staff
`multipart/form-data` with one or more `photos` fields (max 6 files, 5 MB each — `MAX_UPLOAD_FILES` / `MAX_UPLOAD_MB`). The backend:

- buffers the file in memory (nothing is written to the server disk),
- verifies real content via magic bytes (JPEG/PNG/WebP/GIF — a renamed executable or SVG is rejected),
- uploads to Cloudinary in the `nilaara/products` folder with a unique public ID,
- records an `Asset` document (URL + metadata, never binary data).

Returns `201`:

```json
{
  "images": [{ "url": "https://res.cloudinary.com/…/nilaara/products/nil-….jpg", "publicId": "nilaara/products/nil-…", "alt": "" }],
  "urls": ["https://res.cloudinary.com/…"],
  "assetIds": ["…"]
}
```

### `DELETE /api/upload/assets/:publicId` — admin only
`:publicId` must be URL-encoded (it contains `/`). The asset is deleted only if it lives inside the `nilaara/` folder and no product or order references it; otherwise `409`. Returns `{ ok: true }`.

---

## Cart — `/api/cart`

Persistent, server-side cart — **one document per signed-in customer** (guests get `401` on every route; the UI shows a login dialog and replays the action after sign-in). Items store only `{ id, qty }`; names, prices, images and stock limits are always resolved from the current MongoDB product records, so a tampered payload can never change what is charged.

### `GET /api/cart`
`{ items: [{ id, name, price, mrp, image, plating, qty, stock }], totals: { sub, count }, removed: [] }`. Items whose product was deleted/unpublished are dropped from the response (and from the stored cart); quantities are clamped to available stock.

### `POST /api/cart/items`
Body: `{ id, qty }` (qty 1–10). `400` for unknown, unpublished or out-of-stock products; adds are stock-capped. Returns the updated cart view. Rate limited (60/min).

### `POST /api/cart/merge`
Body: `{ items: [{ id, qty }] }` — merges a guest cart after login. Quantities combine and are capped at stock; items no longer sellable are silently skipped. Called exactly once by the frontend right after sign-in.

### `PATCH /api/cart/items/:id`
Body: `{ qty }` — `0` removes the item. `400` when the quantity exceeds current stock (`"Only N left in stock."`).

### `DELETE /api/cart/items/:id` · `DELETE /api/cart`
Remove one item / clear the bag (also used after a successful order).

---

## Settings — `/api/settings`

### `GET /api/settings`
Public storefront configuration: announcement, brand block, `shipping: { freeOver, fee, methods: [{ id, label, fee, etaMinDays, etaMaxDays }] }` (enabled methods only) and `payments: { cod, razorpay }`. `cod` is now `false` (cash on delivery is not offered) and `razorpay` reflects whether online payments are configured. Contains **no secrets**.

---

## Orders — `/api/orders`

### `POST /api/orders` — **login required** (guests → `401`)
Body:

```json
{
  "items": [{ "id": "par-ethnic-kundan-choker", "qty": 1 }],
  "coupon": "B1G1",
  "payment": "cod",
  "shippingMethod": "express",
  "customer": { "name": "…", "phone": "9876543210", "address": "…", "city": "…", "state": "Maharashtra", "pin": "411001", "notes": "Ring the bell twice" }
}
```

The browser sends **only product ids, quantities and the chosen delivery-method id** — the server recomputes every price, coupon, shipping fee and stock decision from its own records, rejects unknown delivery methods (`400`), reserves stock atomically (rolling back on partial failure or order-write failure), stores the chosen method as a snapshot (`shipping: { methodId, label, fee, etaMinDays, etaMaxDays }`), clears the customer's server-side cart, and returns `201` with the authoritative order (immutable item snapshot including the image URL at purchase time). Rate limited (20 / 10 min per IP).

### `POST /api/orders/preview` — login required
Body: `{ items, coupon?, shippingMethod? }`. Server-side recalculation **without creating an order** — returns the full totals object (`items[].lineTotal`, `sub`, `couponOff`, `shipping`, `shippingMethod`, `tax`, `total`). Used by the checkout screens after every basket/method change. Same `400` for unknown products or delivery methods.

### `GET /api/orders/mine?view=live|old` — login required
The signed-in customer's **own** orders (scoped to the session user — never anyone else's). `view=live` → `placed|packed|shipped`; `view=old` → `delivered|cancelled|returned|refunded`; no `view` → all (max 50, newest first).

### `GET /api/orders?status=&limit=` — admin/staff
Order list with full customer details (`toAdmin` shape).

### `PATCH /api/orders/:id` — admin/staff
Body: `{ status, note? }`. Transitions are enforced: forward only (`placed → packed → shipped → delivered`, plus `returned → refunded`); cancellations return reserved stock to the catalogue.

### `GET /api/orders/:id`
Owner-only: requires the admin/staff session or the customer's own session (guest orders are no longer created; `?phone=` matching is kept for legacy guest orders). Anyone else gets `403`. Powers the Track page.

---

## Payments — `/api/payments` (Razorpay)

All routes return **503** until `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` are configured — there are no fake success responses.

### `POST /api/payments/:orderNumber/order` — authenticated owner
Creates a Razorpay order for the amount **computed by the server** from the shop order total (the browser can never choose an amount). Returns `{ keyId, orderId, amountPaise, currency, shopOrderNumber }`.

### `POST /api/payments/:orderNumber/verify`
Body: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`. The HMAC-SHA256 signature is recomputed server-side; only a valid signature marks the order `paid`.

### `POST /api/payments/razorpay/webhook`
Raw-body HMAC verification against `RAZORPAY_WEBHOOK_SECRET`; `payment.captured` / `payment.failed` events are applied idempotently (event IDs de-duplicated), and the response is always `200 {ok:true}` for valid signatures so Razorpay stops retrying.

---

## Stats — `/api/stats` — admin/staff

`{ products, orders, revenue, byStatus, lowStock }`. Revenue excludes cancelled orders. Never exposed publicly.
