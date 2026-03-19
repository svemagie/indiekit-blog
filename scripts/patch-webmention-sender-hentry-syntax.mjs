/**
 * Patch @rmdes/indiekit-endpoint-webmention-sender to fix a syntax error on
 * line 289 where "h-entry"" (double closing quote) causes the module to fail
 * to load entirely, preventing the webmention sender from starting.
 *
 * Root cause: typo in the upstream package — an extra `"` after the string
 * literal `"h-entry"` makes the JS parser see an unterminated expression:
 *
 *   _html.includes("h-entry"")   ← broken
 *   _html.includes("h-entry")    ← fixed
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/controllers/webmention-sender.js",
];

const marker = "[patched:hentry-syntax]";
const oldSnippet = `_html.includes("h-entry"")`;
const newSnippet = `_html.includes("h-entry") /* ${marker} */`;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let filesChecked = 0;
let filesPatched = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  filesChecked += 1;

  const source = await readFile(filePath, "utf8");

  if (source.includes(marker)) {
    console.log("[patch] webmention-sender-hentry-syntax: already applied");
    continue;
  }

  if (!source.includes(oldSnippet)) {
    console.log(
      `[patch] webmention-sender-hentry-syntax: target snippet not found in ${filePath} (package updated or already fixed upstream)`
    );
    continue;
  }

  const updated = source.replace(oldSnippet, newSnippet);
  await writeFile(filePath, updated, "utf8");
  filesPatched += 1;
}

if (filesChecked === 0) {
  console.log("[patch] webmention-sender-hentry-syntax: package file not found");
} else if (filesPatched > 0) {
  console.log(`[patch] webmention-sender-hentry-syntax: patched ${filesPatched}/${filesChecked} file(s)`);
}
