/**
 * Patch: allow Fedify to fetch URLs that resolve to private IP addresses.
 *
 * Root cause:
 *   blog.giersig.eu resolves to 10.100.0.10 (a private RFC-1918 address)
 *   from within the home network where the indiekit server runs. When a
 *   remote Fediverse server sends an activity (Like, Announce, etc.) whose
 *   object URL points to blog.giersig.eu, Fedify tries to dereference that
 *   URL to validate the object. Its built-in SSRF guard calls
 *   validatePublicUrl(), sees the resolved IP is private, and throws:
 *
 *     Disallowed private URL: 'https://blog.giersig.eu/likes/ed6d1/'
 *     Invalid or private address: 10.100.0.10
 *
 *   This causes WebFinger lookups and lookupObject() calls for own-site URLs
 *   to fail, producing ERR-level noise in the log and breaking thread loading
 *   in the ActivityPub reader for local posts.
 *
 * Fix:
 *   Pass allowPrivateAddress: true to createFederation. This disables the
 *   SSRF IP check so Fedify can dereference own-site URLs. The network-level
 *   solution (split-horizon DNS returning the public IP inside the LAN) is
 *   cleaner but requires router/DNS changes outside the codebase.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
];

const MARKER = "// allow private address fix";

const OLD_SNIPPET = `  const federation = createFederation({
    kv,
    queue,
    // Accept signatures up to 12 h old. // signature time window fix
    // Mastodon retries failed deliveries with the original signature, which
    // can be hours old by the time the delivery succeeds.
    signatureTimeWindow: { hours: 12 },
  });`;

const NEW_SNIPPET = `  const federation = createFederation({
    kv,
    queue,
    // Accept signatures up to 12 h old. // signature time window fix
    // Mastodon retries failed deliveries with the original signature, which
    // can be hours old by the time the delivery succeeds.
    signatureTimeWindow: { hours: 12 },
    // Allow fetching own-site URLs that resolve to private IPs. // allow private address fix
    // blog.giersig.eu resolves to 10.100.0.10 on the home LAN. Without this,
    // Fedify's SSRF guard blocks lookupObject() / WebFinger for own posts.
    allowPrivateAddress: true,
  });`;

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
  if (!(await exists(filePath))) {
    continue;
  }

  checked += 1;
  const source = await readFile(filePath, "utf8");

  if (source.includes(MARKER) || source.includes("allowPrivateAddress")) {
    continue;
  }

  if (!source.includes(OLD_SNIPPET)) {
    console.log(`[postinstall] patch-ap-allow-private-address: snippet not found in ${filePath} — skipping`);
    continue;
  }

  const updated = source.replace(OLD_SNIPPET, NEW_SNIPPET);

  if (updated === source) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-allow-private-address to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-allow-private-address: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-allow-private-address: already up to date");
} else {
  console.log(`[postinstall] patch-ap-allow-private-address: patched ${patched}/${checked} file(s)`);
}
