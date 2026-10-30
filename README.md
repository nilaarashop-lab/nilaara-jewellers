# Nilaara Jewellers — static catalogue

A premium catalogue storefront built with **Vite + React**. Customers browse the
collection and every order is completed on **WhatsApp**. There is no customer
login, cart, checkout, or order API.

The site is **fully static**:

- Products and homepage content are JSON files committed to this repository.
- The storefront reads the latest committed JSON on page load, with the
  build-time copy as an offline fallback. There is no content API, database, or
  server to start, sleep, or keep alive.
- Staff edit content through a custom React admin at **`/admin`**. Publishing
  commits to `main`; the change appears on the next storefront page load, without
  waiting for a Vercel rebuild.

## How ordering works

Each product card and product page has a **Buy Now** button that opens WhatsApp
with a short message containing the product name and **product ID**. The
WhatsApp Business auto-reply handles price, availability, payment, and shipping.

- WhatsApp number: `frontend/src/config.js` → `+91 96331 36081`.
- Wishlist: local browser storage, no account.
- Orders are not stored by this website. There is no customer data in the repo.

## Structure

```
frontend/                       # storefront + staff admin
  src/content/products.json     # catalogue (source of truth)
  src/content/settings.json     # homepage hero, announcement, category tiles
  src/data/products.js          # imports JSON; only published products are shown
  src/data/settings.js          # turns admin JSON into storefront settings
  src/data/liveContent.js       # fetches the latest committed JSON at runtime
  src/pages/Admin.jsx           # staff admin shell, dashboard, product table
  src/pages/admin/              # login card, product form, homepage editor
  src/api/github.js             # GitHub Contents API reads/writes + image upload
  public/uploads/               # images uploaded through the admin
  api/auth.js                   # GitHub OAuth start (Vercel function)
  api/callback.js               # GitHub OAuth callback (Vercel function)
  vercel.json                   # SPA fallback + admin noindex headers
docs/                           # deployment notes
```

The repository folder and some product IDs still use the older `par-…` naming
so existing URLs keep working.

## Local development

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run lint
npm test
npm run build
```

There is **no `.env` or API URL to configure** for the storefront.

GitHub OAuth is hosted by Vercel, so local `/admin` login is not available with
plain `vite dev`. Use the deployed admin at
`https://nilaara-jewellers.vercel.app/admin`, run the project with `vercel dev`,
or edit the JSON files directly.

## Editing content

### Through the admin (recommended)

1. Open `/admin` on the deployed site.
2. Sign in with the GitHub account that has write access to
   `nilaarashop-lab/nilaara-jewellers`.
3. Edit **Products** or **Homepage**.
4. Save. The admin commits to `main`; the storefront picks up the new JSON on the
   next page load. Vercel also rebuilds the bundled fallback automatically.

New image uploads are committed to `frontend/public/uploads/` and read from the
repository immediately. Existing ImageKit URLs can stay as they are. Photos are
resized and compressed in the browser so each upload stays below GitHub's 1 MB
Contents API limit.

Only GitHub accounts with **write access** to the repository can publish. There
is no separate admin password. The OAuth token is kept in `sessionStorage` for
the current browser tab and is never committed.

### Directly in Git

- Products: `frontend/src/content/products.json`
- Homepage: `frontend/src/content/settings.json`

A product appears on the storefront only when `status` is `"published"`. Use
`"draft"` or `"archived"` to hide it. The product `id` is used in the URL and in
the WhatsApp message, so keep it unique.

## One-time admin setup

The Vercel project must use **Root Directory = `frontend`**.

1. Create a GitHub OAuth App:
   - **Homepage URL**: `https://nilaara-jewellers.vercel.app`
   - **Authorization callback URL**:
     `https://nilaara-jewellers.vercel.app/api/callback`
2. In Vercel → Project → Settings → Environment Variables, add:
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - optional `SITE_URL` (defaults to the deployment origin)
3. Redeploy.
4. Open `/admin` and sign in.

The client secret is used only inside the two Vercel functions; it is never
included in the browser bundle. The OAuth app requests the `public_repo` scope,
which is the minimum classic scope that can write to this public repository.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full deployment and OAuth
checklist, and [docs/VERCEL.md](docs/VERCEL.md) for Vercel-specific notes.

## Routes

| Route | Page |
| --- | --- |
| `/` | Home |
| `/shop` | Shop / filters |
| `/product/:id` | Product detail (Buy Now on WhatsApp) |
| `/wishlist` | Local favourites (localStorage) |
| `/about`, `/contact`, `/stores` | Brand, contact, stores |
| `/admin` | Staff admin (GitHub sign-in, noindex) |

Retired routes (`/login`, `/register`, `/account`, `/cart`, `/checkout`,
`/success`, `/orders`, `/track`) redirect to `/` or `/shop`.

## Data and privacy

This repository is public. Historical order and promo exports are intentionally
stored **outside this repository**; customer names, phone numbers, addresses,
and order data must never be committed.
