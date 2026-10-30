const img = (id, w = 800) =>
  `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;

export const CATEGORIES = [
  { slug: "jewellery-sets", name: "Jewellery Sets", img: img("photo-1599643478518-a784e5dc4c8f", 400), count: "300+ styles" },
  { slug: "necklaces", name: "Necklaces", img: img("photo-1601121141461-9d6647bca1ed", 400), count: "194 styles" },
  { slug: "earrings", name: "Earrings", img: img("photo-1573408301185-9146fe634ad0", 400), count: "320+ styles" },
  { slug: "jhumkas", name: "Jhumkas", img: img("photo-1617038220319-276d3cfab638", 400), count: "140 styles" },
  { slug: "bangles", name: "Bangles", img: img("photo-1611591437281-460bfbe1220a", 400), count: "210 styles" },
  { slug: "rings", name: "Rings", img: img("photo-1605100804763-247f67b3557e", 400), count: "180 styles" },
];

export const COLLECTIONS = [
  { slug: "gold-plated", name: "Gold Plated", img: img("photo-1611652022419-a9419f74343d", 600) },
  { slug: "american-diamond", name: "American Diamond", img: img("photo-1515562141207-7a88fb7ce338", 600) },
  { slug: "kundan", name: "Kundan", img: img("photo-1584302179602-e4c3d3fd629d", 600) },
  { slug: "temple", name: "Temple", img: img("photo-1602173574767-37ac01994b2a", 600) },
  { slug: "oxidised", name: "Oxidised", img: img("photo-1610694955371-d4a3e0ce4b52", 600) },
  { slug: "pearl", name: "Pearl & Beaded", img: img("photo-1599643477877-530eb83abc8e", 600) },
];

export const PRODUCTS = [
  {
    id: "par-ethnic-kundan-choker",
    name: "Rajwadi Kundan Pearl Choker Necklace Set",
    category: "jewellery-sets", collection: "kundan",
    plating: "22K Gold Plated", stones: "Kundan • Pearls",
    price: 1149, mrp: 3475,
    badge: "Bestseller", tag: "",
    images: [img("photo-1599643478518-a784e5dc4c8f"), img("photo-1584302179602-e4c3d3fd629d")],
    desc: "Handcrafted festive choker with kundan polki, faux pearls and gold-plated brass base. Includes matching jhumka earrings.",
  },
  {
    id: "par-temple-lakshmi-bangle",
    name: "Divine Lakshmi Temple Bangles — Set of 2",
    category: "bangles", collection: "temple",
    plating: "24K Gold Plated", stones: "Ruby • Emerald",
    price: 1299, mrp: 2569,
    badge: "Bestseller", tag: "",
    images: [img("photo-1611591437281-460bfbe1220a"), img("photo-1617038220319-276d3cfab638")],
    desc: "Temple-work bangles with carved Lakshmi motif, ruby-emerald accents. Sizes 2.4 / 2.6 / 2.8.",
  },
  {
    id: "par-tribal-necklace-set",
    name: "Tribal Magic Green & Red Necklace Set",
    category: "necklaces", collection: "oxidised",
    plating: "Antique Gold Oxidised", stones: "Crystal • Beads",
    price: 1299, mrp: 2569,
    badge: "New", tag: "",
    images: [img("photo-1601121141461-9d6647bca1ed"), img("photo-1602173574767-37ac01994b2a")],
    desc: "Oxidised tribal set with dome accents, everyday festive wear, skin-friendly plating.",
  },
  {
    id: "par-rose-gold-bracelet",
    name: "American Diamond Zirconia Rose-Gold Bracelet",
    category: "bangles", collection: "american-diamond",
    plating: "Rose Gold Plated", stones: "Cubic Zirconia",
    price: 1249, mrp: 2429,
    badge: "Bestseller", tag: "",
    images: [img("photo-1610694955371-d4a3e0ce4b52"), img("photo-1515562141207-7a88fb7ce338")],
    desc: "Demi-fine bangle-style bracelet, tarnish-resistant, perfect for western & office wear.",
  },
  {
    id: "par-emerald-drop-earrings",
    name: "Royal Green & Black Statement Drop Earrings",
    category: "earrings", collection: "gold-plated",
    plating: "24K Gold Plated", stones: "Enamel • CZ",
    price: 1249, mrp: 2125,
    badge: "New", tag: "",
    images: [img("photo-1573408301185-9146fe634ad0"), img("photo-1617038220319-276d3cfab638")],
    desc: "Black enamel with sea-green stone drops, lightweight yet statement.",
  },
  {
    id: "par-pearl-kundan-bangles",
    name: "Set of 6 Gold Pearl & Stone Traditional Bangles",
    category: "bangles", collection: "pearl",
    plating: "Gold Plated", stones: "Pearl • Kundan",
    price: 1149, mrp: 2663,
    badge: "Bestseller", tag: "",
    images: [img("photo-1600003014755-ba31aa59c4b6"), img("photo-1611591437281-460bfbe1220a")],
    desc: "Classic bridal stack — 6 bangles with pearl beading, fits festive & wedding looks.",
  },
  {
    id: "par-coin-necklace",
    name: "Charming Coins Oxidised Statement Necklace Set",
    category: "jewellery-sets", collection: "oxidised",
    plating: "Dual Silver-Gold", stones: "Coins • Beads",
    price: 1299, mrp: 2175,
    badge: "Trending", tag: "",
    images: [img("photo-1611652022419-a9419f74343d"), img("photo-1599643478518-a784e5dc4c8f")],
    desc: "Multilayer coin necklace, boho-ethnic crossover, pairs with sarees & kurtis.",
  },
  {
    id: "par-kundan-hair-brooch",
    name: "Dazzling Kundan Pearl Hair Brooch with Jhumka",
    category: "jewellery-sets", collection: "kundan",
    plating: "22K Gold Plated", stones: "Kundan • Pearl",
    price: 1249, mrp: 2875,
    badge: "New", tag: "",
    images: [img("photo-1620656798579-1984d9e87df7"), img("photo-1599643477877-530eb83abc8e")],
    desc: "Hair accessory + brooch two-in-one, wedding & haldi favourite.",
  },
  {
    id: "par-white-pearl-choker",
    name: "Dazzling White Gold-Plated Pearl Choker Set",
    category: "necklaces", collection: "pearl",
    plating: "18K Gold Plated", stones: "Shell Pearls",
    price: 799, mrp: 2664,
    badge: "Bestseller", tag: "",
    images: [img("photo-1599643477877-530eb83abc8e"), img("photo-1601121141461-9d6647bca1ed")],
    desc: "Contemporary pearl-beaded choker, lightweight for daily ethnic.",
  },
  {
    id: "par-mangalsutra-bracelet",
    name: "Minimal Gold Mangalsutra-Style Bracelet",
    category: "bangles", collection: "gold-plated",
    plating: "18K Gold Plated", stones: "Zirconia",
    price: 749, mrp: 1375,
    badge: "Demi-Fine", tag: "",
    images: [img("photo-1611085583191-a3b181a88401"), img("photo-1515562141207-7a88fb7ce338")],
    desc: "Waterproof, tarnish-free demi-fine bracelet for everyday wear.",
  },
  {
    id: "par-emerald-hoops",
    name: "Contemporary Emerald Zirconia Hoop Drops",
    category: "earrings", collection: "american-diamond",
    plating: "18K Gold Plated", stones: "Emerald CZ",
    price: 599, mrp: 1572,
    badge: "Demi-Fine", tag: "",
    images: [img("photo-1630019852942-f89202989a59"), img("photo-1573408301185-9146fe634ad0")],
    desc: "Stainless-steel base, waterproof hoops, hypoallergenic hooks.",
  },
  {
    id: "par-leaf-ring",
    name: "American Diamond Leaf Adjustable Ring",
    category: "rings", collection: "american-diamond",
    plating: "18K Gold Plated", stones: "Cubic Zirconia",
    price: 799, mrp: 1625,
    badge: "New", tag: "",
    images: [img("photo-1605100804763-247f67b3557e"), img("photo-1515562141207-7a88fb7ce338")],
    desc: "Adjustable openable leaf design, one size fits all.",
  },
  {
    id: "par-kashmiri-jhumka",
    name: "Long Kashmiri Jhumkas with Gold Beads",
    category: "jhumkas", collection: "temple",
    plating: "22K Gold Plated", stones: "Pearl • Meenakari",
    price: 799, mrp: 1650,
    badge: "Bestseller", tag: "",
    images: [img("photo-1617038220319-276d3cfab638"), img("photo-1602173574767-37ac01994b2a")],
    desc: "Long festive jhumkas, ultra-light despite statement size.",
  },
  {
    id: "par-pearl-oval-choker",
    name: "Pearl Oval-Link Gold Choker Necklace Set",
    category: "necklaces", collection: "pearl",
    plating: "22K Gold Plated", stones: "Pearl • CZ",
    price: 799, mrp: 2664,
    badge: "Trending", tag: "",
    images: [img("photo-1601121141461-9d6647bca1ed"), img("photo-1611652022419-a9419f74343d")],
    desc: "Modern oval-link choker, layers beautifully with chains.",
  },
  {
    id: "par-green-kundan-set",
    name: "Radiant Green Kundan Pearl Necklace Set",
    category: "jewellery-sets", collection: "kundan",
    plating: "22K Gold Plated", stones: "Kundan • Emerald beads",
    price: 749, mrp: 2500,
    badge: "Festive", tag: "",
    images: [img("photo-1584302179602-e4c3d3fd629d"), img("photo-1599643478518-a784e5dc4c8f")],
    desc: "Pendant set with emerald beads, perfect for mehendi / sangeet.",
  },
  {
    id: "par-gold-spiral-pendant",
    name: "Gold-Toned Spiral Motif Round Pendant with Chain",
    category: "necklaces", collection: "gold-plated",
    plating: "Gold Plated", stones: "—",
    price: 649, mrp: 1248,
    badge: "Demi-Fine", tag: "",
    images: [img("photo-1602173574767-37ac01994b2a"), img("photo-1601121141461-9d6647bca1ed")],
    desc: "Minimal everyday pendant, 18-inch chain with extender.",
  },
  {
    id: "par-vintage-danglers",
    name: "Elegant Pearl & Stone Vintage Filigree Danglers",
    category: "earrings", collection: "pearl",
    plating: "Gold Plated", stones: "Pearl • Crystal",
    price: 649, mrp: 1311,
    badge: "New", tag: "",
    images: [img("photo-1573408301185-9146fe634ad0"), img("photo-1630019852942-f89202989a59")],
    desc: "Filigree danglers, vintage charm, wedding-guest favourite.",
  },
  {
    id: "par-pearl-festive-choker",
    name: "Pearl Glow Kundan Festive Choker Set",
    category: "jewellery-sets", collection: "kundan",
    plating: "Gold Plated", stones: "Kundan • Pearls",
    price: 749, mrp: 1371,
    badge: "Festive", tag: "",
    images: [img("photo-1599643478518-a784e5dc4c8f"), img("photo-1611652022419-a9419f74343d")],
    desc: "Soft-glow festive choker, photographs beautifully.",
  },
  {
    id: "par-cascade-earrings",
    name: "Golden Strands Cascade Earrings",
    category: "earrings", collection: "gold-plated",
    plating: "Gold Plated", stones: "Chains • Beads",
    price: 749, mrp: 2283,
    badge: "Western", tag: "",
    images: [img("photo-1617038220319-276d3cfab638"), img("photo-1573408301185-9146fe634ad0")],
    desc: "Western cascade strands, party & cocktail pick.",
  },
  {
    id: "par-nath-nose-pin",
    name: "Floral Enamel Nath Nose Pin with Pearl",
    category: "rings", collection: "temple",
    plating: "18K Gold Plated", stones: "Enamel • Pearl",
    price: 799, mrp: 1571,
    badge: "Bridal", tag: "",
    images: [img("photo-1620656798579-1984d9e87df7"), img("photo-1605100804763-247f67b3557e")],
    desc: "Traditional nath with pierced + non-pierced options.",
  },
];

export const HERO_IMG = img("photo-1611652022419-a9419f74343d", 1200);
export const SIDE_IMGS = [
  img("photo-1599643478518-a784e5dc4c8f", 600),
  img("photo-1515562141207-7a88fb7ce338", 600),
];
export const FESTIVE_IMG = img("photo-1584302179602-e4c3d3fd629d", 900);

export const formatINR = (n) => "₹" + Number(n).toLocaleString("en-IN");

/**
 * Discount percentage vs MRP. Returns 0 when there is no genuine markdown
 * (missing/zero MRP, or MRP not above the selling price) so the UI never shows
 * "NaN% off", "-Infinity% off" or a negative discount.
 */
export const discountPercent = (price, mrp) => {
  const p = Number(price);
  const m = Number(mrp);
  return Number.isFinite(p) && Number.isFinite(m) && m > p && p >= 0
    ? Math.round((1 - p / m) * 100)
    : 0;
};
