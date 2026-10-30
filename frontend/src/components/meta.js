import { useEffect } from "react";

/**
 * Per-page title and description.
 *
 * The app is a client-rendered SPA, so this updates the browser tab and helps
 * search engines that execute JavaScript. Link previews on WhatsApp/Facebook
 * read the static tags in index.html — per-product previews would need
 * prerendering, which this site does not have.
 */
const SITE = "Nilaara Jewellers";
export const SITE_ORIGIN = "https://nilaara-jewellers.vercel.app";

const DEFAULT_TITLE = `${SITE} • Artificial Jewellery`;
const DEFAULT_DESCRIPTION =
  "Nilaara Jewellers — premium artificial jewellery. Temple jewellery, non-idol designs, white stone & diamond replica, chokers, earrings, bracelets, bangles, rings and long necklaces.";

const setMeta = (attr, key, content) => {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

export function usePageMeta(title, description = DEFAULT_DESCRIPTION, path = "") {
  useEffect(() => {
    const fullTitle = title ? `${title} • ${SITE}` : DEFAULT_TITLE;
    const desc = String(description || DEFAULT_DESCRIPTION).trim().slice(0, 160);
    document.title = fullTitle;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", `${SITE_ORIGIN}${path}`);
  }, [title, description, path]);
}
