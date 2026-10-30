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
   ships. It must be the same origin as the `/api/*` rewrite destination in
   [frontend/vercel.json](../frontend/vercel.json) (that file is where the browser actually
   sends API traffic — see below).

## How the browser reaches the API

The deployed storefront never calls the API host directly. `frontend/vercel.json` proxies
`/api/*` to the API, and production builds talk to `/api` on their own origin
([client.js](../frontend/src/api/client.js)). That keeps the session cookie **first-party**,
which is what Safari and every iOS browser require — they reject a cookie set by another site
even when it is marked `SameSite=None; Secure`. Chrome, Edge and Firefox were fine with the
cross-site cookie; iPhones were not.

If the API moves, update the rewrite `destination` in `frontend/vercel.json` and redeploy.
Do not point `VITE_API_URL` at the API host and expect cookies to work on iOS again.

## Backend prerequisites

The API must be publicly reachable over HTTPS, and in its environment:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | MongoDB Atlas connection string |
| `STORAGE_DRIVER` | `imagekit` (or `cloudinary`) |
| `FRONTEND_URL` | exact storefront origin(s), comma-separated, no trailing slash — e.g. `https://shop.your-domain.com,https://your-app.vercel.app` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAMESITE` | leave unset (defaults to `lax`); only a client calling the API cross-site directly needs `none` |

`COOKIE_SAMESITE=none` left over from an older cross-site deployment must be removed — it makes
Safari discard the session cookie even though the request is now same-origin.

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
- [ ] Login from an iPhone (Safari **and** Chrome for iOS) survives a refresh — the iOS cookie check
- [ ] Hard refresh on a product URL does not 404
- [ ] Image uploads in the admin return an ImageKit URL
- [ ] A Buy Now button opens WhatsApp with the product name + ID

## Troubleshooting

| Symptom | Cause |
|---|---|
| Gold "Our collection is temporarily unavailable" panel | API unreachable, CORS/`FRONTEND_URL` mismatch, or `VITE_API_URL` wrong at build time |
| Demo products on the live site | `VITE_API_URL` missing in the Vercel build — the app deliberately runs in demo mode only when no API is configured |
| 404 after refresh / shared deep link | `frontend/vercel.json` missing, or the project's Root Directory isn't `frontend` |
| Login works, then you're logged out | cookie rejected: `COOKIE_SECURE` must be `true`, `COOKIE_SAMESITE` must be `lax` (not `none`), and `FRONTEND_URL` must list the exact storefront origin |
| Register succeeds but the form says the browser didn't keep the sign-in | the `Set-Cookie` never landed. On an iPhone this is the cross-site cookie: check that `/api/*` is served by the rewrite in `frontend/vercel.json`, not by the API host directly, and that the deployed build is the one from after that change |
| Old version still served after a push | check the commit hash on the deployment; redeploy without build cache |

See also [DEPLOYMENT.md](DEPLOYMENT.md) for the full production checklist.
