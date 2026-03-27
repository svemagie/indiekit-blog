/**
 * Patch: fix endpoint URL resolution to use application.url (HTTPS) instead
 * of getUrl(request) (HTTP) as the base URL for relative endpoint paths.
 *
 * Indiekit resolves relative endpoint paths (e.g. "/media") to absolute URLs
 * using getUrl(request), which returns `http://` because Express sees HTTP
 * connections from nginx (no trust proxy set). This results in
 * `application.mediaEndpoint = "http://blog.giersig.eu/media"` being passed
 * to the frontend, causing mixed-content failures in Safari ("Load failed")
 * when the media browser tries to fetch that URL from an HTTPS page.
 *
 * Fix: prefer application.url (the configured HTTPS base URL) over
 * getUrl(request) when resolving relative endpoint paths.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/indiekit/lib/endpoints.js",
];

const oldCode =
  ": new URL(application[endpoint], getUrl(request)).href;";
const newCode =
  ": new URL(application[endpoint], application.url || getUrl(request)).href;";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let checked = 0;
let patched = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) continue;

  checked += 1;
  const source = await readFile(filePath, "utf8");

  if (source.includes(newCode)) {
    continue;
  }

  if (!source.includes(oldCode)) {
    console.warn(`[postinstall] endpoint-urls-protocol: snippet not found in ${filePath} — skipping`);
    continue;
  }

  const updated = source.replace(oldCode, newCode);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoints.js found");
} else if (patched === 0) {
  console.log("[postinstall] endpoint URL protocol patch already applied");
} else {
  console.log(`[postinstall] Patched endpoint URL protocol in ${patched} file(s)`);
}
