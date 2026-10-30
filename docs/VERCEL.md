# Vercel deployment

Vercel hosts the **whole site**: the Vite storefront plus two small Node
functions for staff GitHub login. There is no separate API host, content
service, or database.

## One-time setup

1. Import `nilaarashop-lab/nilaara-jewellers` into Vercel.
2. Set **Root Directory → `frontend`**. The repository root has no frontend
   `package.json`.
3. Framework preset **Vite**. Build `npm run build`, output `dist`.
4. Add the admin environment variables:
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_CLIENT_SECRET`
   - optional `SITE_URL` (the deployed origin)
5. Create the GitHub OAuth App with callback
   `https://<domain>/api/callback`.

No `VITE_API_URL` is needed. Delete it if it is left over from the Render
backend. Nothing is proxied to Render.

## Request routing

`frontend/vercel.json` handles three things:

- `/api/auth` and `/api/callback` are Vercel functions in `frontend/api/`.
- Every other path falls back to `index.html` for client-side routing.
- Admin and API responses are marked `no-store`; `/admin` is `noindex, nofollow`.

The admin itself is a normal React route (`frontend/src/pages/Admin.jsx`), not a
separate static admin page.

## Publishing content

Every admin save creates a commit on `main` through GitHub's Contents API. The
connected Vercel project rebuilds automatically, bundling the new JSON files.

The content files are:

- `frontend/src/content/products.json`
- `frontend/src/content/settings.json`
- uploads in `frontend/public/uploads/`

## Deploying manually

```powershell
npm i -g vercel
cd frontend
vercel link
vercel --prod
```

Environment variables are set in the Vercel dashboard, not in `.env`.

## Post-deploy checks

- [ ] `/shop` shows only published products from the repository
- [ ] Hard refresh on `/product/<id>` returns the app, not a 404
- [ ] `/admin` loads the staff login card
- [ ] GitHub login completes and returns to the admin
- [ ] A test save commits to `main` and starts a deployment
- [ ] A Buy Now button opens WhatsApp with the product name + ID

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Build fails at repo root | Vercel Root Directory is not `frontend` |
| `/admin` 404s | The SPA fallback is missing from `vercel.json`, or the project was not redeployed |
| Login says not configured | Missing GitHub OAuth env vars, or deployment predates them |
| `redirect_uri_mismatch` | OAuth App callback URL differs from `/api/callback` |
| Admin says the account cannot publish | The GitHub account has read-only repository access |
| Admin commits but site is stale | Vercel Git integration is disconnected, or the commit went to another branch |
| Old products still show | The deployment has not finished, or the product was edited outside the admin and not pushed |
