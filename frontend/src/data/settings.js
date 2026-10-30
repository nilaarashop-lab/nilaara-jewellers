import raw from "../content/settings.json";

/**
 * Storefront settings come from frontend/src/content/settings.json, which is
 * edited by staff through the GitHub-backed admin (/admin). This module turns
 * the editor shape into the exact shape the storefront components use.
 */

const imageRef = (url, alt = "") => (url ? { url, alt } : null);
const list = (value) => (Array.isArray(value) ? value : []);

const heroSlides = list(raw.home?.heroSlides)
  .filter((s) => s.active !== false && (s.title || s.image))
  .slice(0, 4)
  .map((s) => ({
    image: imageRef(s.image, s.alt),
    eyebrow: s.eyebrow || "",
    title: s.title || "",
    highlight: s.highlight || "",
    text: s.text || "",
  }));

const cards = list(raw.home?.cards)
  .filter((c) => c.active !== false && (c.title || c.image))
  .slice(0, 4)
  .map((c) => ({
    image: imageRef(c.image, c.alt),
    eyebrow: c.eyebrow || "",
    title: c.title || "",
    text: c.text || "",
    to: c.to || "/shop",
    linkLabel: c.linkLabel || "Shop now",
  }));

const categoryTiles = list(raw.home?.categoryTiles)
  .filter((t) => t.slug && t.image)
  .map((t) => ({ slug: t.slug, url: t.image, alt: t.alt || "" }));

const festive = raw.home?.festive;

export const SITE_SETTINGS = {
  announcement: raw.announcement?.active
    ? {
        text: raw.announcement.text || "",
        shortText: raw.announcement.shortText || raw.announcement.text || "",
        messages: list(raw.announcement.messages)
          .filter((m) => typeof m === "string" || m?.active !== false)
          .map((m) => (typeof m === "string" ? m : m?.message || m?.text || ""))
          .filter(Boolean),
      }
    : null,
  home: {
    heroSlides,
    cards,
    festive:
      festive?.active
        ? { url: festive.image || "", alt: festive.alt || "", active: true }
        : null,
    categoryTiles,
  },
  shipping: {
    freeOver: Number(raw.shipping?.freeOver ?? 999),
    fee: Number(raw.shipping?.fee ?? 79),
  },
};
