// Edit names / addresses / hours here — links are your live Google Maps shops.
export const STORES = [
  {
    id: "store-1",
    name: "Nilaara Jewellers — Store 1",
    area: "Visit us in-store",
    address: "Tap “Get Directions” for exact location • Open all days",
    hours: "10:30 AM – 9:00 PM, Mon–Sun",
    phone: "+91-98XXXXXXXX",
    coords: "9.5917471,76.5259062",
    mapsUrl: "https://maps.app.goo.gl/b5izLruNQbqpM4Q77",
  },
  {
    id: "store-2",
    name: "Nilaara Jewellers — Store 2",
    area: "Visit us in-store",
    address: "Tap “Get Directions” for exact location • Open all days",
    hours: "10:30 AM – 9:00 PM, Mon–Sun",
    phone: "+91-98XXXXXXXX",
    coords: "9.617801,76.532909",
    mapsUrl: "https://maps.app.goo.gl/uGBTnD3KChhMhwUz8",
  },
];

export const embedUrl = (store) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(store.coords || store.mapsUrl)}&z=16&output=embed`;
