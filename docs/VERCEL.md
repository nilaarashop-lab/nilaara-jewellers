# Deploying & updating on Vercel

Vercel hosts the **storefront only** (`frontend/`). The Express API in `backend/` runs on a
separate host — Vercel serverless functions are not a fit for this server (persistent sessions,
ImageKit uploads, long-lived MongoDB connection).

## One-time project setup

1. **Import the repository** `nilaarashop-lab/nilaara-jewellers` into Vercel.
2. On the import screen set **Root Directory → `frontend`**. There is no root `package.json`,
   so importing the repo root fails to build.
3. Framework preset **Vite** (auto-detected). Build `npm run build`, output `dist` — these come
   from [frontend/vercel.json](../frontend/vercel.json), which also rewrites every path to
   `/index.html` so a hard refresh on `/admin` or `/product/...` doesn't 404.
4. **Project → Settings → Environment Variables** — add for *Production* (and *Preview* if you
   want previews to talk to the API):

   ```
   VITE_API_URL = https://api.your-domain.com
   ```

   Vite inlines this at **build** time. Without it the build runs in demo mode (built-in
   catalogue, no login); pointed at `http://localhost:5000` every product page shows the
   "temporarily unavailable" panel, because the visitor's browser cannot reach your machine.
   `frontend/.env` is git-ignored and is never uploaded — the dashboard value is the one that
   ships.

## Backend prerequisites

The API must be publicly reachable over HTTPS, and in its environment:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | MongoDB Atlas connection string |
| `STORAGE_DRIVER` | `imagekit` (or `cloudinary`) |
| `FRONTEND_URL` | exact storefront origin(s), comma-separated, no trailing slash — e.g. `https://shop.your-domain.com,https://your-app.vercel.app` |
| `COOKIE_SECURE` | `true` |

**Cookie caveat.** Sessions are `HttpOnly` + `SameSite=Lax`. If the storefront is on
`*.vercel.app` and the API on an unrelated domain, the browser treats them as cross-site and
drops the session cookie — login appears to succeed and then bounces. Put both on the same
registrable domain (`shop.example.com` + `api.example.com`), or change `sameSite` to `"none"`
(with `COOKIE_SECURE=true`) in `backend/lib/session.js` and allow the exact origin in CORS.

## Deploying an update

### Connected to Git (the normal path)

Every push to the production branch (`main`) triggers a build:

```powershell
cd D:\parinaya-jewels
git add -A
git commit -m "Describe the change"
git push origin main
```

Watch **Project → Deployments**; a build takes about a minute. Commits on other branches and
pull requests get their own preview URL and never touch production.

### Without a Git connection

```powershell
npm i -g vercel
cd D:\parinaya-jewels\frontend
vercel link          # link to the existing project
vercel --prod        # build + promote to production
```

### After changing an environment variable

Redeploy from **Deployments → ⋯ → Redeploy** and untick *Use existing build cache* — the old
bundle still contains the previous `VITE_API_URL`.

## Post-deploy check

- [ ] `/shop` lists the real database catalogue (not the demo products, not the retry panel)
- [ ] `/admin` loads for an admin account; the Admin pill is in the navbar
- [ ] Login survives a refresh (no cookie dropped)
- [ ] Hard refresh on a product URL does not 404
- [ ] Image uploads in the admin return an ImageKit URL
- [ ] An order can be placed end to end (COD)

## Troubleshooting

| Symptom | Cause |
|---|---|
| Gold "Our collection is temporarily unavailable" panel | API unreachable, CORS/`FRONTEND_URL` mismatch, or `VITE_API_URL` wrong at build time |
| Demo products on the live site | `VITE_API_URL` missing in the Vercel build — the app deliberately runs in demo mode only when no API is configured |
| 404 after refresh / shared deep link | `frontend/vercel.json` missing, or the project's Root Directory isn't `frontend` |
| Login works, then you're logged out | cross-site cookie (see the caveat above) or `FRONTEND_URL` origin mismatch |
| Old version still served after a push | check the commit hash on the deployment; redeploy without build cache |

See also [DEPLOYMENT.md](DEPLOYMENT.md) for the full production checklist.
