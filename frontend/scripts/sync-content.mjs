import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy the canonical JSON into public/content so the storefront can fetch the
 * latest deployed snapshot at runtime. The commit SHA lets an open page ignore
 * an older build until the build containing its admin edit is live.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/content");
const output = resolve(root, "public/content");
const commit = process.env.VERCEL_GIT_COMMIT_SHA || "";

mkdirSync(output, { recursive: true });

for (const name of ["products.json", "settings.json"]) {
  const doc = JSON.parse(readFileSync(resolve(source, name), "utf8"));
  writeFileSync(
    resolve(output, name),
    `${JSON.stringify({ ...doc, _commit: commit }, null, 2)}\n`
  );
}
