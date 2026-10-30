import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UNUSED_PHOTO_GRACE_MS,
  imageKitPath,
  referencedImageKitPaths,
  unusedPhotos,
} from "../src/data/media.js";

const endpoint = "https://ik.imagekit.io/w4bq6axnq";

test("imageKitPath extracts the folder path from an ImageKit URL", () => {
  assert.equal(imageKitPath(`${endpoint}/nilaara/products/a.png`), "/nilaara/products/a.png");
  assert.equal(imageKitPath(`${endpoint}/nilaara/products/a.png?tr=w-600,q-70`), "/nilaara/products/a.png");
  assert.equal(imageKitPath(`${endpoint}/nilaara/products/a%20b.png`), "/nilaara/products/a b.png");
});

test("imageKitPath ignores anything that is not an ImageKit file", () => {
  assert.equal(imageKitPath(""), "");
  assert.equal(imageKitPath(null), "");
  assert.equal(imageKitPath("/uploads/photo.webp"), "");
  assert.equal(imageKitPath("https://raw.githubusercontent.com/o/r/main/a.png"), "");
  assert.equal(imageKitPath(endpoint), "");
});

test("references are collected from every corner of both documents", () => {
  const products = {
    products: [
      { id: "a", images: [`${endpoint}/nilaara/products/one.png`, "/uploads/two.webp"] },
      { id: "b", images: [`${endpoint}/nilaara/products/one.png`] },
    ],
  };
  const settings = {
    home: {
      heroSlides: [{ image: `${endpoint}/nilaara/products/hero.png?tr=w-1200` }],
      festive: { active: false, image: `${endpoint}/nilaara/products/old-festive.png` },
    },
  };

  const referenced = referencedImageKitPaths([products, settings]);

  assert.deepEqual(
    [...referenced].sort(),
    ["/nilaara/products/hero.png", "/nilaara/products/old-festive.png", "/nilaara/products/one.png"]
  );
});

test("an old, unreferenced photo is listed for deletion", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const files = [
    { url: `${endpoint}/nilaara/products/junk.png`, path: "/nilaara/products/junk.png", createdAt: "2026-10-01T09:00:00Z" },
  ];
  assert.equal(unusedPhotos(files, new Set(), { now }).length, 1);
});

test("photos still used by a product or block are kept", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const files = [
    { url: `${endpoint}/nilaara/products/used.png?tr=w-600`, createdAt: "2026-10-01T09:00:00Z" },
    { path: "/nilaara/products/path-only.png", createdAt: "2026-10-01T09:00:00Z" },
  ];
  const referenced = referencedImageKitPaths([
    { products: [{ images: [`${endpoint}/nilaara/products/used.png`] }] },
    { home: { cards: [{ image: `${endpoint}/nilaara/products/path-only.png` }] } },
  ]);
  assert.deepEqual(unusedPhotos(files, referenced, { now }), []);
});

test("a photo from the last day is left alone", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const fresh = { url: `${endpoint}/nilaara/products/fresh.png`, createdAt: "2026-10-30T11:00:00Z" };
  const edge = { url: `${endpoint}/nilaara/products/edge.png`, createdAt: "2026-10-29T12:00:00Z" };
  assert.deepEqual(unusedPhotos([fresh], new Set(), { now }), []);
  assert.equal(unusedPhotos([edge], new Set(), { now, graceMs: 0 }).length, 1);
  assert.equal(UNUSED_PHOTO_GRACE_MS, 24 * 60 * 60 * 1000);
});

test("a photo without an upload date is kept", () => {
  const files = [{ url: `${endpoint}/nilaara/products/unknown.png`, createdAt: "" }];
  assert.deepEqual(unusedPhotos(files, new Set(), { now: Date.parse("2026-10-30T12:00:00Z") }), []);
});
