import rawSettings from "../content/settings.json";
import { mediaUrl } from "./repo.js";

/**
 * Storefront settings come from frontend/src/content/settings.json, which is
 * edited by staff through the GitHub-backed admin (/admin). This module turns
 * the editor shape into the exact shape the storefront components use.
 */

const imageRef = (url, alt = "") => (url ? { url: mediaUrl(url), alt } : null);
const list = (value) => (Array.isArray(value) ? value : []);

export function normalizeSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};

  const heroSlides = list(source.home?.heroSlides)
    .filter((s) => s.active !== false && (s.title || s.image))
    .slice(0, 4)
    .map((s) => ({
      image: imageRef(s.image, s.alt),
      eyebrow: s.eyebrow || "",
      title: s.title || "",
      highlight: s.highlight || "",
      text: s.text || "",
    }));

  const cards = list(source.home?.cards)
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

  const categoryTiles = list(source.home?.categoryTiles)
    .filter((t) => t.slug && t.image)
    .map((t) => ({ slug: t.slug, url: mediaUrl(t.image), alt: t.alt || "" }));

  const festive = source.home?.festive;

  return {
    announcement: source.announcement?.active
      ? {
          text: source.announcement.text || "",
          shortText: source.announcement.shortText || source.announcement.text || "",
          messages: list(source.announcement.messages)
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
          ? { url: mediaUrl(festive.image || ""), alt: festive.alt || "", active: true }
          : null,
      categoryTiles,
    },
    shipping: {
      freeOver: Number(source.shipping?.freeOver ?? 999),
      fee: Number(source.shipping?.fee ?? 79),
    },
  };
}

export const SITE_SETTINGS = normalizeSettings(rawSettings);
