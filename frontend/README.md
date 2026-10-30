# Nilaara Jewellers — storefront (Vite + React)

Static catalogue storefront. Customers browse and order on **WhatsApp**. There
is no customer login, cart, checkout, API server, or database in the deployed
site.

## Commands

```powershell
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

No environment variables are needed.

## Content

- `src/content/products.json` — catalogue. Only `status: "published"` products
  are shown; `draft` and `archived` stay hidden.
- `src/content/settings.json` — announcement bar, hero slides, promo cards,
  festive banner, category tile images and free-shipping threshold.
- `public/uploads/` — images uploaded through the CMS.
- `src/config.js` — WhatsApp number and message builders.

Staff edit these through the Git CMS at `/admin/` on the deployed site. The CMS
config is `public/admin/config.yml`; GitHub OAuth is handled by `api/auth.js`
and `api/callback.js` on Vercel.

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
| `/admin/` | Staff Git CMS |

Retired routes (`/login`, `/register`, `/account`, `/cart`, `/checkout`,
`/success`, `/orders`, `/track`) redirect to `/` or `/shop`.

## Structure

- `src/config.js` — WhatsApp number + message builders
- `src/content/` — Git-managed JSON content
- `src/data/products.js` — imports the catalogue and filters published items
- `src/data/settings.js` — normalizes homepage settings for components
- `src/store/StoreContext.jsx` — wishlist + static settings
- `src/components/Layout.jsx` — header, product cards, footer, icons
- `src/pages/` — Home, Shop, Product, Misc (Wishlist/About/Contact), Stores
