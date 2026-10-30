# Nilaara Jewellers — static catalogue

A premium catalogue storefront built with **Vite + React**. Customers browse the
collection and every order is completed on **WhatsApp**. There is no customer
login, cart, checkout, or order API.

The site is **fully static**:

- Products and homepage content are JSON files committed to this repository.
- Vercel builds the storefront from those files — there is no API server to
  start, sleep, or keep alive.
- Staff edit content through the Git-based CMS at **`/admin/`**; publishing
  commits to `main` and triggers a Vercel rebuild.

## How ordering works

Each product card and product page has a **Buy Now** button that opens WhatsApp
with a short message containing the product name and **product ID**. The
WhatsApp Business auto-reply handles price, availability, payment, and shipping.

- WhatsApp number: `frontend/src/config.js` → `+91 96331 36081`.
- Wishlist: local browser storage, no account.
- Orders are not stored by this website. There is no customer data in the repo.

## Structure

```
frontend/                       # storefront + Git CMS
  src/content/products.json     # catalogue (source of truth)
  src/content/settings.json     # homepage hero, announcement, category tiles
  src/data/products.js          # imports JSON; only published products are shown
  src/data/settings.js          # turns editor JSON into storefront settings
  public/admin/                 # Decap CMS page + config
  public/uploads/               # images uploaded through the CMS
  api/auth.js                   # GitHub OAuth start (Vercel function)
  api/callback.js               # GitHub OAuth callback (Vercel function)
  vercel.json                   # SPA fallback + admin redirect/headers
backend/                        # legacy reference only; not deployed or called
docs/                           # deployment and legacy backend guides
```

The repository folder and some product IDs still use the older `par-…` naming
so existing URLs keep working.

## Local development

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run build
```

There is **no `.env` or API URL to configure** for the storefront.

Local `/admin/` login is not used because GitHub OAuth is hosted on Vercel. Use
the deployed admin at `https://nilaara-jewellers.vercel.app/admin/` or edit the
JSON files directly.

## Editing content

### Through the CMS (recommended)

1. Open `/admin/` on the deployed site.
2. Sign in with the GitHub account that has write access to
   `nilaarashop-lab/nilaara-jewellers`.
3. Edit **Products** or **Homepage & announcement**.
4. Publish. The CMS commits to `main`; Vercel rebuilds automatically.

New CMS image uploads are committed to `frontend/public/uploads/` and served
from `/uploads/…`. Existing ImageKit URLs can stay as they are.

### Directly in Git

- Products: `frontend/src/content/products.json`
- Homepage: `frontend/src/content/settings.json`

A product appears on the storefront only when `status` is `"published"`. Use
`"draft"` or `"archived"` to hide it. The product `id` is used in the URL and in
the WhatsApp message, so keep it unique.

## One-time CMS setup

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
4. Open `/admin/` and sign in.

Only GitHub accounts with write access to the repository can publish. The
client secret is used only inside the Vercel functions; it is never included in
the browser bundle.

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
| `/admin/` | Staff Git CMS (not part of the React app) |

Retired routes (`/login`, `/register`, `/account`, `/cart`, `/checkout`,
`/success`, `/orders`, `/track`) redirect to `/` or `/shop`.

## Legacy backend

`backend/` is kept for reference and historical data export. The deployed
storefront does not call it. The old Render service and keep-alive workflow are
no longer required.

Historical order and promo exports are intentionally stored **outside this
repository** because the repo is public.
