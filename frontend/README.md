# Nilaara Jewellers — storefront (Vite + React)

Static catalogue storefront. Customers browse and order on **WhatsApp**. There
is no customer login, cart, checkout, API server, or database in the deployed
site.

## Commands

```powershell
npm install
npm run dev      # http://localhost:5173
npm run lint
npm test
npm run build
```

No environment variables are needed for the storefront.

## Content

- `src/content/products.json` — catalogue. Only `status: "published"` products
  are shown; `draft` and `archived` stay hidden.
- `src/content/settings.json` — announcement bar, hero slides, promo cards,
  festive banner, category tile images and the freebies threshold.
- `public/uploads/` — images uploaded through the admin.
- `src/config.js` — WhatsApp number and message builders.

Staff edit these through the React admin at `/admin` on the deployed site. The
admin reads and writes the JSON files through GitHub's Contents API, so every
save is a commit on `main`. The storefront fetches the latest committed JSON on
page load (with the bundled copy as a fallback), then refreshes it in place
every 10 seconds and immediately after a save in another tab on the same device.
No page reload or Vercel rebuild is needed. GitHub OAuth is handled by
`api/auth.js` and `api/callback.js` on Vercel.

## Admin

- `/admin` — sign in with a GitHub account that has write access to
  `nilaarashop-lab/nilaara-jewellers`.
- Dashboard — catalogue counts, low stock, out of stock, hidden products.
- Products — add, edit, delete, change product IDs, upload up to 6 photos.
- Homepage — announcement messages, hero slides, promo cards, festive banner,
  category tiles and shipping thresholds.
- Images are resized/compressed in the browser, then committed to
  `public/uploads/`.

The OAuth token lives in `sessionStorage` and is cleared when the tab closes or
staff press **Lock**. Only the two OAuth functions run on Vercel; there is no
content API or database.

## WhatsApp number

Every **Buy Now** button, header icon, footer link and contact button reads from
one file:

```
src/config.js
  WHATSAPP_NUMBER   # digits only, country code first — 919633136081
  WHATSAPP_DISPLAY  # what visitors see — +91 96331 36081
```

`productEnquiryMessage(product)` builds the pre-filled text: greeting + product
name + product ID. The WhatsApp Business auto-reply handles price, availability,
payment and shipping.

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

## Structure

- `src/config.js` — WhatsApp number + message builders
- `src/content/` — Git-managed JSON content
- `src/data/products.js` — imports the catalogue and filters published items
- `src/data/settings.js` — normalizes homepage settings for components
- `src/api/github.js` — GitHub Contents API, image upload, OAuth popup
- `src/data/liveContent.js` — runtime JSON refresh with bundled fallback
- `src/data/repo.js` — repository coordinates and upload URL helper
- `src/api/client.js` — local catalogue search helpers
- `src/pages/Admin.jsx` — staff admin shell
- `src/pages/admin/` — login, product form, homepage editor, image slot
- `src/store/StoreContext.jsx` — wishlist + static settings
- `src/components/Layout.jsx` — header, product cards, footer, icons
- `src/pages/` — Home, Shop, Product, Misc (Wishlist/About/Contact), Stores
