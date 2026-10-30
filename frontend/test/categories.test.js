import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_CATEGORIES, categoryLabel, listCategories, slugify } from "../src/data/categories.js";

const SECTIONS = [
  "temple-jewellery",
  "non-idol-design",
  "white-stone",
  "diamond-replica",
  "ring-necklace",
  "choker",
  "earrings",
  "bracelet",
  "bangles",
  "rings",
  "long-necklace",
];

test("an admin-typed category becomes a clean slug and a readable label", () => {
  assert.equal(slugify("  Bridal Sets "), "bridal-sets");
  assert.equal(slugify("Chokers!"), "chokers");
  assert.equal(categoryLabel("bridal-sets"), "Bridal Sets");
  assert.equal(categoryLabel("Bridal Sets"), "Bridal Sets");
  assert.equal(categoryLabel("temple-jewellery"), "Temple Jewellery");
  assert.equal(categoryLabel(""), "");
});

test("re-saving the displayed label keeps the stored slug, so old links survive", () => {
  for (const stored of SECTIONS) assert.equal(slugify(categoryLabel(stored)), stored);
});

test("every shop section is listed, in menu order, before its first design", () => {
  const list = listCategories([]);
  assert.deepEqual(list.map((c) => c.slug), SECTIONS);
  assert.ok(list.every((c) => c.img && c.name));
});

test("a category only the catalogue uses joins the list after the shop sections", () => {
  const products = [
    { category: "Chokers", images: ["/uploads/b.webp"] },
    { category: "bangles", images: [] },
    { category: "necklaces", images: [] },
  ];
  const list = listCategories(products);
  assert.deepEqual(list.map((c) => c.slug), [...SECTIONS, "chokers", "necklaces"]);
  assert.equal(list.find((c) => c.slug === "chokers").name, "Chokers");
  assert.equal(list.find((c) => c.slug === "chokers").img, "/uploads/b.webp");
});

test("a design's own photo is the tile, the shop art is only the fallback", () => {
  const builtIn = BASE_CATEGORIES.find((c) => c.slug === "rings");
  assert.equal(listCategories([]).find((c) => c.slug === "rings").img, builtIn.img);
  assert.equal(
    listCategories([{ category: "rings", images: ["/uploads/ring.webp"] }]).find((c) => c.slug === "rings").img,
    "/uploads/ring.webp"
  );
});

test("an uploaded tile picture wins over both the product photo and the shop art", () => {
  const list = listCategories([{ category: "choker", images: ["/uploads/product.webp"] }], [
    { slug: "choker", url: "/uploads/choker-tile.webp", alt: "Chokers on display" },
  ]);
  const choker = list.find((c) => c.slug === "choker");
  assert.equal(choker.img, "/uploads/choker-tile.webp");
  assert.equal(choker.alt, "Chokers on display");
});
