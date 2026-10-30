# Deployment Guide — static catalogue + GitHub admin

The deployed site is **only** the Vite frontend plus two small Vercel functions
for GitHub login. Products and homepage content are committed JSON files read at
runtime, with the build-time copy as a fallback; there is no content API or
database.

## Prerequisites

- Node.js 18+ (tested on Node 24)
- A Vercel account connected to the GitHub repository
- A GitHub OAuth App for the staff admin

## 1. Vercel project

1. Import `nilaarashop-lab/nilaara-jewellers` into Vercel.
2. Set **Root Directory → `frontend`**.
3. Framework preset **Vite**; build `npm run build`; output `dist` (also in
   `frontend/vercel.json`).
4. No API URL, database, or content service is needed. Content is bundled from
   the committed JSON files at build time.

`frontend/vercel.json` keeps the SPA fallback and marks admin/API responses as
no-store/noindex.

## 2. Staff admin login (GitHub OAuth)

The admin is a React page at `/admin`. It uses GitHub's Contents API directly
from the browser to read and write the content JSON. Two Vercel functions under
`frontend/api/` handle the OAuth handshake:

- `api/auth.js` — redirects to GitHub with a short-lived `state` cookie.
- `api/callback.js` — exchanges the one-time code for a token and posts it back
  to the admin popup.

The token is stored in `sessionStorage`, never in the repository.

### Create the GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

| Field | Value |
| --- | --- |
| Application name | Nilaara Admin |
| Homepage URL | `https://nilaara-jewellers.vercel.app` |
| Authorization callback URL | `https://nilaara-jewellers.vercel.app/api/callback` |

Copy the **Client ID**, then generate a **Client Secret**.

If the production domain changes, update the OAuth App callback URL. No file in
the repository needs to change.

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

Only GitHub accounts with **write access** to the repository can publish. The
admin checks `permissions.push` when it signs in, and GitHub rejects any write
from a read-only account. There is no separate admin password list to maintain.
Remove someone's repository access to remove admin access.

## 3. Editing flow

1. Open `https://nilaara-jewellers.vercel.app/admin`.
2. Sign in with GitHub.
3. Edit **Products** or **Homepage**.
4. Save.

Each save is a commit on `main`. The storefront fetches the latest committed
JSON from GitHub on page load, polls it while open, and refreshes immediately
after a save in another tab on the same device. The page updates in place — no
reload or rebuild wait. Vercel also rebuilds in the background to refresh the
bundled offline fallback.

New uploads go to `frontend/public/uploads/` and are read from the repository
immediately. Existing ImageKit URLs remain valid and can be kept. Photos are
resized and compressed in the browser to stay below GitHub's 1 MB Contents API
limit.

## 4. Content files

| File | Purpose |
| --- | --- |
| `frontend/src/content/products.json` | Product catalogue (`products` array) |
| `frontend/src/content/settings.json` | Announcement, hero slides, cards, festive banner, category tiles, free-shipping threshold |
| `frontend/public/uploads/` | Admin image uploads |

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

The local React app reads the same JSON files. GitHub login is only available on
the deployed Vercel site (or with `vercel dev`) because OAuth needs the callback
URL.

## 6. Historical data

This repository is public. Customer names, phone numbers, addresses, and order
data must never be committed.

The historical orders and promo record were exported to a private folder
outside this repository and are not part of the deployed site.

## 7. Pre-launch checklist

- [ ] Vercel Root Directory is `frontend`
- [ ] `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` are set in Vercel
- [ ] GitHub OAuth callback is exactly `https://<domain>/api/callback`
- [ ] `/admin` opens and GitHub login succeeds
- [ ] A test admin edit commits to `main` and appears on the next storefront load
- [ ] `/shop` shows only published products
- [ ] `/product/<id>` hard refresh works
- [ ] A Buy Now button opens WhatsApp with the product name + ID
- [ ] No customer/order data exists in `git ls-files`

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/admin` loads but login says not configured | `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` in Vercel; redeploy |
| GitHub returns `redirect_uri_mismatch` | OAuth App callback must match `/api/callback` exactly, including https |
| Login state did not match | Cookies blocked, or `SITE_URL`/domain changed between auth and callback |
| Admin says the account cannot publish | The GitHub account needs write access to the repository |
| Admin saves but site does not change | The commit must reach `main`; refresh the storefront tab. Check the browser can reach `raw.githubusercontent.com` |
| New image is broken | Check `frontend/public/uploads/…` was committed; the storefront reads it from the repository immediately |
| Product is missing | Its `status` is not `published`, or the product ID is blank/duplicated |
