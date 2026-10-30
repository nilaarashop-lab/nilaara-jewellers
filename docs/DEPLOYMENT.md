# Deployment Guide — static catalogue + Git CMS

The deployed site is **only** the Vite frontend. Products and homepage content
are committed JSON files; there is no API, database, or Render service in the
customer path.

## Prerequisites

- Node.js 18+ (tested on Node 24)
- A Vercel account connected to the GitHub repository
- A GitHub OAuth App for the staff CMS

## 1. Vercel project

1. Import `nilaarashop-lab/nilaara-jewellers` into Vercel.
2. Set **Root Directory → `frontend`**.
3. Framework preset **Vite**; build `npm run build`; output `dist` (also in
   `frontend/vercel.json`).
4. Do **not** add `VITE_API_URL`. There is no backend to call.

`frontend/vercel.json` keeps the SPA fallback, redirects `/admin` to `/admin/`,
and marks admin/API responses as no-store/noindex.

## 2. Staff CMS login (GitHub OAuth)

The CMS uses Decap CMS with the GitHub backend. Authentication is handled by two
Vercel functions under `frontend/api/`.

### Create the GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

| Field | Value |
| --- | --- |
| Application name | Nilaara Admin |
| Homepage URL | `https://nilaara-jewellers.vercel.app` |
| Authorization callback URL | `https://nilaara-jewellers.vercel.app/api/callback` |

Copy the **Client ID**, then generate a **Client Secret**.

If the production domain changes, update both the OAuth App callback URL and
`base_url` in `frontend/public/admin/config.yml`.

### Vercel environment variables

Project → Settings → Environment Variables (Production, and Preview if needed):

| Variable | Value |
| --- | --- |
| `GITHUB_OAUTH_CLIENT_ID` | OAuth App Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | OAuth App Client Secret |
| `SITE_URL` | optional; defaults to the request origin. Set to `https://nilaara-jewellers.vercel.app` if using a custom domain/proxy |

The secret stays in the Vercel function and is never included in the browser
bundle.

Redeploy after adding the variables.

### Who can edit

Only GitHub accounts with write access to the repository can publish. There is
no separate admin password list to maintain. Remove someone's repository access
to remove CMS access.

## 3. Editing flow

1. Open `https://nilaara-jewellers.vercel.app/admin/`.
2. Sign in with GitHub.
3. Edit **Products** or **Homepage & announcement**.
4. Publish.

Decap commits to `main`; Vercel detects the commit and rebuilds. The new content
is live when the deployment finishes.

New uploads go to `frontend/public/uploads/` and are served from `/uploads/…`.
Existing ImageKit URLs remain valid and can be kept.

## 4. Content files

| File | Purpose |
| --- | --- |
| `frontend/src/content/products.json` | Product catalogue (`products` array) |
| `frontend/src/content/settings.json` | Announcement, hero slides, cards, festive banner, category tiles, free-shipping threshold |
| `frontend/public/admin/config.yml` | CMS fields |
| `frontend/public/uploads/` | CMS image uploads |

A product is visible only when `status` is `published`. `draft` and `archived`
are hidden from the storefront and search. The product `id` is used in the
`/product/<id>` URL and in the WhatsApp Buy Now message, so it must be unique.

## 5. Local development

```powershell
cd frontend
npm ci
npm run dev      # http://localhost:5173
npm run build    # dist/
```

The local React app reads the same JSON files. CMS login is only available on
the deployed Vercel site because GitHub OAuth needs the callback URL.

## 6. Historical data

This repository is public. Customer names, phone numbers, addresses, and order
data must never be committed.

The historical orders and promo record were exported to a private folder
outside this repository. The old `backend/` folder remains for reference only
and is not deployed.

## 7. Pre-launch checklist

- [ ] Vercel Root Directory is `frontend`
- [ ] `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` are set in Vercel
- [ ] GitHub OAuth callback is exactly `https://<domain>/api/callback`
- [ ] `/admin/` opens and GitHub login succeeds
- [ ] A test CMS edit commits to `main` and triggers a Vercel rebuild
- [ ] `/shop` shows only published products
- [ ] `/product/<id>` hard refresh works
- [ ] A Buy Now button opens WhatsApp with the product name + ID
- [ ] No customer/order data exists in `git ls-files`
- [ ] The old Render service and keep-alive workflow are no longer needed

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/admin/` loads but login says not configured | `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` in Vercel; redeploy |
| GitHub returns `redirect_uri_mismatch` | OAuth App callback must match `/api/callback` exactly, including https |
| Login state did not match | Cookies blocked, or `SITE_URL`/domain changed between auth and callback |
| CMS publishes but site does not change | Vercel Git integration / deployment status; the commit must reach `main` |
| New image is broken | Check `frontend/public/uploads/…` was committed and the Vercel build finished |
| Product is missing | Its `status` is not `published`, or the product ID is blank/duplicated |
