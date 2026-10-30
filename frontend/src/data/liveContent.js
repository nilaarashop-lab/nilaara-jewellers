import { commitRawRoot } from "./repo.js";

const BUILD_ROOT = "/content";
const TIMEOUT_MS = 6000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // A fresh query string keeps the browser and Vercel edge from reusing an
    // older snapshot of the deployed content.
    const res = await fetch(`${url}?v=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Content request failed (${res.status}).`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadPair(productsUrl, settingsUrl) {
  const [products, settings] = await Promise.allSettled([
    fetchJson(productsUrl),
    fetchJson(settingsUrl),
  ]);

  return {
    products:
      products.status === "fulfilled" && Array.isArray(products.value?.products)
        ? products.value
        : null,
    settings:
      settings.status === "fulfilled" && settings.value && typeof settings.value === "object"
        ? settings.value
        : null,
  };
}

/**
 * The snapshot Vercel built from the latest commit. This is the normal source
 * for page loads and background polls, and it never suffers from GitHub's
 * five-minute raw branch cache.
 */
export function loadBuildContent() {
  return loadPair(`${BUILD_ROOT}/products.json`, `${BUILD_ROOT}/settings.json`);
}

/**
 * Content at an exact commit. Used after an admin save so the new product is
 * visible immediately, before Vercel finishes rebuilding.
 */
export function loadCommitContent(commit) {
  if (!commit) return Promise.resolve({ products: null, settings: null });
  const root = `${commitRawRoot(commit)}/frontend/src/content`;
  return loadPair(`${root}/products.json`, `${root}/settings.json`);
}
