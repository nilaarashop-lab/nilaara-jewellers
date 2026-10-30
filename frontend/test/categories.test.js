import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryLabel, listCategories, slugify } from "../src/data/categories.js";

test("an admin-typed category becomes a clean slug and a readable label", () => {
  assert.equal(slugify("  Bridal Sets "), "bridal-sets");
  assert.equal(slugify("Chokers!"), "chokers");
  assert.equal(categoryLabel("bridal-sets"), "Bridal Sets");
  assert.equal(categoryLabel("Bridal Sets"), "Bridal Sets");
  assert.equal(categoryLabel("jewellery-sets"), "Jewellery Sets");
  assert.equal(categoryLabel(""), "");
});

test("re-saving the displayed label keeps the stored slug, so old links survive", () => {
  for (const stored of ["jewellery-sets", "necklaces", "earrings", "jhumkas", "bangles", "rings"]) {
    assert.equal(slugify(categoryLabel(stored)), stored);
  }
});

test("the category list is generated from the catalogue, built-ins first", () => {
  const products = [
    { category: "bangles", images: ["/uploads/a.webp"] },
    { category: "Chokers", images: ["/uploads/b.webp"] },
    { category: "necklaces", images: [] },
  ];
  const list = listCategories(products);
  assert.deepEqual(list.map((c) => c.slug), ["necklaces", "bangles", "chokers"]);
  assert.equal(list[2].name, "Chokers");
  assert.equal(list[2].img, "/uploads/b.webp");
  assert.match(list[0].img, /unsplash\.com/);
});

test("an uploaded tile picture wins over the built-in art", () => {
  const list = listCategories([{ category: "rings", images: [] }], [
    { slug: "rings", url: "/uploads/ring.webp", alt: "Rings on display" },
  ]);
  assert.equal(list[0].img, "/uploads/ring.webp");
  assert.equal(list[0].alt, "Rings on display");
});
