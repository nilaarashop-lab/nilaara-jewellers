# ImageKit Image Storage Guide

> **Legacy reference only.** The deployed storefront no longer uploads to ImageKit through the Express backend. Existing ImageKit image URLs remain valid, but new staff uploads go through the GitHub-backed admin into `frontend/public/uploads/`. This guide documents the archived backend integration and is kept for historical reference.

Nilaara stores product & homepage images on **ImageKit** (the project's current
setup). The backend streams uploads straight from the admin panel to ImageKit
using its REST API — no SDK, and nothing is saved on the app server or in
MongoDB (only `{url, publicId, alt}` references).

## 1. Get your Private key

1. Log in to [imagekit.io](https://imagekit.io).
2. Open **Developer Options → API Keys**.
3. Copy the **Private key** (the Public key is optional here — it's only used by
   browser-side upload widgets, which this project doesn't use).

## 2. Configure `backend/.env`

```
STORAGE_DRIVER=imagekit
IMAGEKIT_PRIVATE_KEY=your_private_key_from_dashboard

# Optional — only if your account uses a custom CDN CNAME:
# IMAGEKIT_URL_ENDPOINT=https://your-cname.example
```

`config/env.js` validates this at boot: with `STORAGE_DRIVER=imagekit` the
server **refuses to start** without `IMAGEKIT_PRIVATE_KEY`, and in production
`STORAGE_DRIVER=local` is always rejected. On a misconfigured setup uploads
return a friendly 503 telling the administrator which key is missing.

Uploaded images land in the ImageKit folder **`nilaara/products`** with unique
file names (`nil-<timestamp>-<random>.jpg`).

## 3. How it works

```
admin panel ──▶ POST /api/upload ──▶ upload.imagekit.io (Basic auth:
multipart photos[]   (memory buffer,    PrivateKey:) ──▶ ik.imagekit.io/
                     magic-byte check)                    nilaara/products/…
```

- **Upload** — `POST https://upload.imagekit.io/api/v1/files/upload` with a
  multipart `file` blob + `fileName` + `folder`; Basic auth uses the private
  key as the username and an empty password.
- **publicId** — stores ImageKit's `fileId`; deletes later use it.
- **Delete** — `DELETE https://api.imagekit.io/v1/files/{fileId}` (same Basic
  auth). Library deletes in the admin panel are provider-aware and only act on
  assets this project owns (an Asset document must exist), and only when no
  product/order still references the URL.
- **Allow-list** — saved ImageKit URLs are HTTPS on `ik.imagekit.io` (or your
  custom `IMAGEKIT_URL_ENDPOINT` host), both pre-allow-listed in
  `config/env.js → imageHostAllowlist()`, so the admin panel accepts them.

## 4. Switching providers

Everything already running on Cloudinary keeps working: images carry their
provider in the Asset record, and image cleanup deletes through the right
driver regardless of the active one. Moving *old* assets between providers is
out of scope of this guide — new uploads always go to the active provider.

Former Cloudinary users: see [CLOUDINARY.md](CLOUDINARY.md) for the equivalent
Cloudinary setup.
