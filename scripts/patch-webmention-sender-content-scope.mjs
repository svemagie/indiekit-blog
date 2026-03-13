/**
 * Patch @rmdes/indiekit-endpoint-webmention-sender webmention.js to:
 *
 * Scope link extraction to the post content area only (.e-content inside
 * .h-entry, or <article>, or <main>) when processing a full page.
 * Without this, links from the sidebar, navigation, and footer are included
 * because the live-fetch patch fetches the full rendered page HTML.
 *
 * Falls back to the whole document when no content container is found
 * (e.g. when processing a stored post body fragment rather than a full page).
 */

import { access, readFile, writeFile } from "node:fs/promises";

const filePath =
  "node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/webmention.js";

const patchMarker = "// [patched:content-scope]";

const originalBlock = `  $("a[href]").each((_, el) => {`;

const newBlock = `  // [patched:content-scope] Scope to post content area only, so that
  // sidebar/nav/footer links from the live-fetched full page are excluded.
  const contentRoot =
    $(".h-entry .e-content").first().length
      ? $(".h-entry .e-content").first()
      : $(".e-content").first().length
      ? $(".e-content").first()
      : $("article").first().length
      ? $("article").first()
      : $("main").first().length
      ? $("main").first()
      : null;

  const scope = contentRoot ?? $;

  scope.find("a[href]").each((_, el) => {`;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(filePath))) {
  console.log("[patch-webmention-sender-content-scope] File not found, skipping");
  process.exit(0);
}

const source = await readFile(filePath, "utf8");

if (source.includes(patchMarker)) {
  console.log("[patch-webmention-sender-content-scope] Already patched");
  process.exit(0);
}

if (!source.includes(originalBlock)) {
  console.warn(
    "[patch-webmention-sender-content-scope] Target block not found — upstream format may have changed, skipping"
  );
  process.exit(0);
}

const patched = source.replace(originalBlock, newBlock);

if (!patched.includes(patchMarker)) {
  console.warn("[patch-webmention-sender-content-scope] Patch validation failed, skipping");
  process.exit(0);
}

await writeFile(filePath, patched, "utf8");
console.log("[patch-webmention-sender-content-scope] Patched successfully");
