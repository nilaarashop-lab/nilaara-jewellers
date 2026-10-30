import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy the canonical JSON into public/content so the storefront can fetch the
 * latest deployed snapshot at runtime. The commit SHA lets an open page ignore
 * an older build until the build containing its admin edit is live.
 *
 * Also writes public/sitemap.xml from the same catalogue — product URLs change
 * whenever the merchant adds or deletes a piece, so it is generated at build
 * time instead of being hand-maintained.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/content");
const output = resolve(root, "public/content");
const publicDir = resolve(root, "public");
const commit = process.env.VERCEL_GIT_COMMIT_SHA || "";
const site = (process.env.SITE_URL || "https://nilaara-jewellers.vercel.app").replace(/\/+$/, "");

mkdirSync(output, { recursive: true });

const catalogue = JSON.parse(readFileSync(resolve(source, "products.json"), "utf8"));

for (const name of ["products.json", "settings.json"]) {
  const doc = JSON.parse(readFileSync(resolve(source, name), "utf8"));
  writeFileSync(
    resolve(output, name),
    `${JSON.stringify({ ...doc, _commit: commit }, null, 2)}\n`
  );
}

const escapeXml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const staticRoutes = [
  { path: "/", priority: "1.0" },
  { path: "/shop", priority: "0.9" },
  { path: "/stores", priority: "0.7" },
  { path: "/about", priority: "0.5" },
  { path: "/contact", priority: "0.5" },
];
const published = (catalogue.products || []).filter(
  (p) => p && p.id && (p.status || "published") === "published"
);
const urls = [
  ...staticRoutes.map((r) => ({ loc: `${site}${r.path}`, priority: r.priority })),
  ...published.map((p) => ({
    loc: `${site}/product/${encodeURIComponent(p.id)}`,
    priority: "0.8",
  })),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  )
  .join("\n")}
</urlset>
`;

writeFileSync(resolve(publicDir, "sitemap.xml"), sitemap);
