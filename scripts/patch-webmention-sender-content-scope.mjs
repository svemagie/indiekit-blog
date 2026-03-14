/**
 * Patch @rmdes/indiekit-endpoint-webmention-sender webmention.js:
 *
 * Fix `scope.find is not a function` crash when a post has no .h-entry,
 * <article>, or <main> element. In that case contentRoot is null and
 * `scope = contentRoot ?? $` sets scope to the Cheerio constructor function
 * which has no .find() method. Using $.root() instead returns a proper
 * Cheerio document object that supports .find().
 */

import { access, readFile, writeFile } from "node:fs/promises";

const filePath =
  "node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/webmention.js";

const patchMarker = "// [patched:scope-root]";
const oldLine = "  const scope = contentRoot ?? $;";
const newLine = "  const scope = contentRoot ?? $.root(); // [patched:scope-root]";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(filePath))) {
  console.log("[postinstall] patch-webmention-sender-content-scope: file not found, skipping");
  process.exit(0);
}

const source = await readFile(filePath, "utf8");

if (source.includes(patchMarker)) {
  console.log("[postinstall] patch-webmention-sender-content-scope: already patched");
  process.exit(0);
}

if (!source.includes(oldLine)) {
  console.warn(
    "[postinstall] patch-webmention-sender-content-scope: target line not found — skipping"
  );
  process.exit(0);
}

await writeFile(filePath, source.replace(oldLine, newLine), "utf8");
console.log("[postinstall] patch-webmention-sender-content-scope: patched $.root() fix");
