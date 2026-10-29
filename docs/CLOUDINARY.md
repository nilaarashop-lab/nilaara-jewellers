# Cloudinary Image Storage Guide

Nilaara stores **all new product images on Cloudinary** — a CDN built for images. The backend streams uploads straight from the admin panel to Cloudinary; nothing is saved on the app server and no binary data enters MongoDB (only `{url, publicId, alt}` references).

## 1. Get credentials (free tier is fine)

1. Sign up at [cloudinary.com](https://cloudinary.com) (free "Plus" tier: 25 GB storage + bandwidth/month — plenty for a jewellery catalogue).
2. Open the **Dashboard** — you'll see three values:
   - **Cloud name** → `CLOUDINARY_CLOUD_NAME`
   - **API key** → `CLOUDINARY_API_KEY`
   - **API secret** → `CLOUDINARY_API_SECRET` (click to reveal)

> ⚠️ The **API secret must never leave the server**. It is read only from `backend/.env` (git-ignored) and is never included in any API response or client bundle. If it ever leaks, regenerate it from the dashboard immediately.

## 2. Configure the backend

In `backend/.env`:

```
STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your-secret
```

`config/env.js` validates this at boot: production **refuses to start** with `STORAGE_DRIVER=local` or with missing Cloudinary credentials. Local development may keep `STORAGE_DRIVER=local` (files land in `backend/uploads/`), but Cloudinary is recommended everywhere.

## 3. How uploads work

```
Admin browser ──multipart──▶ Express (multer MEMORY storage, 5 MB × 6 max)
                                │  magic-byte check (JPEG/PNG/WebP/GIF)
                                ▼
                          Cloudinary SDK ──▶ res.cloudinary.com/<cloud>/image/upload/
                                │               nilaara/products/nil-<timestamp>-<random>
                                ▼
                          MongoDB Asset + Product.images [{url, publicId, alt}]
```

- **Magic-byte verification**: content is inspected, not just the client-declared MIME type — an `.exe` or SVG renamed to `.jpg` is rejected before it ever reaches Cloudinary.
- **Unique public IDs** in the organized `nilaara/products` folder, so deletion and reference checks are unambiguous.
- **Incoming transformation** strips EXIF metadata; delivery applies `f_auto, q_auto` for fast, modern formats (WebP/AVIF where supported).
- Upload failures roll back any images already uploaded in the same request, and the product record is never half-written.

## 4. Migrating existing images

The repeatable migration script re-hosts images that currently live in `backend/uploads/` (or, optionally, external URLs such as the seeded Unsplash demo images):

```powershell
cd backend

# 1. Always start with a dry run — nothing is uploaded, nothing is written
npm run migrate-images -- --dry-run

# 2. Migrate local /uploads files
npm run migrate-images

# 3. (Optional) also re-host external URLs e.g. Unsplash
npm run migrate-images -- --import-external
```

What it guarantees:

- **Backup first** — every product document is written to `backend/backup/products-images-<timestamp>.json` before any change.
- **Idempotent** — images that already have a `publicId` are skipped; re-running never duplicates assets.
- **Report** — a JSON report (migrated / already-migrated / external-skipped / failed / manual-attention) is saved to `backend/backup/migration-report-<timestamp>.json` and summarised in the console.
- **Originals are never deleted** — files in `backend/uploads/` stay in place. Verify the storefront, keep your backup, then delete them yourself whenever you're confident.

External URLs (e.g. `images.unsplash.com`) remain valid in development because the default allow-list includes them, but production has an **empty** `ALLOWED_IMAGE_HOSTS` — run with `--import-external` so every product image is Cloudinary-hosted before going live.

## 5. Safe deletion rules

Cloudinary assets are only ever deleted when **all** of these hold:

1. The public ID is inside our own `nilaara/` folder (guard: `lib/imageRefs.js → ownsCloudinaryFolder`) — the API can never delete unrelated assets or another account's resources.
2. No **other product** references the same URL or public ID.
3. No **order** references the image in its historical item snapshot — orders always keep the appearance they had at purchase time.
4. For replacement: the new image is uploaded and the product document is saved **before** the old asset is cleaned up.

## 6. Admin panel behaviour

The Add/Edit Product form supports: file selection with instant preview, up to 6 images, upload progress + clear success/error messages, removing images, replacing images, and paste-a-Cloudinary-link (production rejects non-allow-listed hosts). Products can only be saved once required uploads have succeeded, and saved images persist across refreshes (they're stored by URL/publicId in MongoDB).
