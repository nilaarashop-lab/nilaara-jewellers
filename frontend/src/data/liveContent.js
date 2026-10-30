import { RAW_ROOT } from "./repo.js";

const PRODUCTS_URL = `${RAW_ROOT}/frontend/src/content/products.json`;
const SETTINGS_URL = `${RAW_ROOT}/frontend/src/content/settings.json`;
const TIMEOUT_MS = 6000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // A fresh query string bypasses GitHub's five-minute raw cache, so a save
    // is visible on the very next fetch (page load or background poll).
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

/**
 * Read the latest catalogue and homepage settings from the repository.
 * Each file is independent: a failure in one leaves the bundled fallback for
 * that file while the other can still update.
 */
export async function loadLiveContent() {
  const [products, settings] = await Promise.allSettled([
    fetchJson(PRODUCTS_URL),
    fetchJson(SETTINGS_URL),
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
