# Nilaara Jewellers — storefront (Vite + React)

Catalogue storefront: customers browse the collection and order on **WhatsApp**. There is no customer login, cart or checkout; `/admin` (staff login) is the only authenticated area.

## Commands

```powershell
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

Create `.env` to point at the API (without it the app runs on the built-in demo catalogue):

```
VITE_API_URL=http://localhost:5000
```

## WhatsApp number

Every **Buy Now** button, header icon, footer link and contact button reads from a single config file:

```
src/config.js
  WHATSAPP_NUMBER   # digits only, country code first — 919633136081
  WHATSAPP_DISPLAY  # what visitors see — +91 96331 36081
```

`productEnquiryMessage(product)` builds the short pre-filled text — "I'd like to buy this product" + product name + product ID — which the WhatsApp Business auto-reply picks up (price, availability, payment, shipping).

Product IDs are set per product in the admin panel (*Add / Edit product → Product ID*) and are also the `/product/<id>` URL; the backend normalises them to lower-case-with-dashes and rejects duplicates.

## Routes

| Route | Page |
| --- | --- |
| `/` | Home |
| `/shop` | Shop / filters |
| `/product/:id` | Product detail (Buy Now on WhatsApp) |
| `/wishlist` | Local favourites (localStorage) |
| `/about`, `/contact`, `/stores` | Brand, contact (opens WhatsApp), stores |
| `/admin` | Staff panel |

Retired routes (`/login`, `/register`, `/account`, `/cart`, `/checkout`, `/success`, `/orders`, `/track`) redirect to `/` or `/shop`.

## Structure

- `src/config.js` — WhatsApp number + message builders
- `src/api/client.js` — API client (products, settings, admin, staff auth)
- `src/store/StoreContext.jsx` — wishlist + public settings
- `src/store/AuthContext.jsx` — staff session (used only by `/admin`)
- `src/components/Layout.jsx` — header, cards, footer, icons
- `src/pages/` — Home, Shop, Product, Misc (Wishlist/About/Contact), Stores, Admin
