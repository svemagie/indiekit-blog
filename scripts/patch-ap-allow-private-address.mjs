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

const patchSpecs = [
  // Case 1: v2.15+ — signatureTimeWindow present, upstream comment style (no marker suffix)
  {
    name: "upstream-v2.15-with-signature-time-window",
    oldSnippet: `  const federation = createFederation({
    kv,
    queue,
    // Accept signatures up to 12 h old.
    // Mastodon retries failed deliveries with the original signature, which
    // can be hours old by the time the delivery succeeds.
    signatureTimeWindow: { hours: 12 },
  });`,
    newSnippet: `  const federation = createFederation({
    kv,
    queue,
    // Accept signatures up to 12 h old.
    // Mastodon retries failed deliveries with the original signature, which
    // can be hours old by the time the delivery succeeds.
    signatureTimeWindow: { hours: 12 },
    // Allow fetching own-site URLs that resolve to private IPs. // allow private address fix
    // blog.giersig.eu resolves to 10.100.0.10 on the home LAN. Without this,
    // Fedify's SSRF guard blocks lookupObject() / WebFinger for own posts.
    allowPrivateAddress: true,
  });`,
  },
  // Case 2: signatureTimeWindow present with old marker comment style
  {
    name: "with-signature-time-window-marker",
    oldSnippet: `  const federation = createFederation({
    kv,
    queue,
    // Accept signatures up to 12 h old. // signature time window fix
    // Mastodon retries failed deliveries with the original signature, which
    // can be hours old by the time the delivery succeeds.
    signatureTimeWindow: { hours: 12 },
  });`,
    newSnippet: `  const federation = createFederation({
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
  });`,
  },
  // Case 3: fresh install without signatureTimeWindow — add both
  {
    name: "fresh-without-signature-time-window",
    oldSnippet: `  const federation = createFederation({
    kv,
    queue,
  });`,
    newSnippet: `  const federation = createFederation({
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
  });`,
  },
];

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
  let source = await readFile(filePath, "utf8");

  if (source.includes(MARKER) || source.includes("allowPrivateAddress")) {
    continue;
  }

  let applied = false;
  for (const spec of patchSpecs) {
    if (!source.includes(spec.oldSnippet)) continue;
    const updated = source.replace(spec.oldSnippet, spec.newSnippet);
    if (updated === source) continue;
    await writeFile(filePath, updated, "utf8");
    patched += 1;
    applied = true;
    console.log(`[postinstall] Applied patch-ap-allow-private-address (${spec.name}) to ${filePath}`);
    break;
  }

  if (!applied) {
    console.log(`[postinstall] patch-ap-allow-private-address: no matching snippet in ${filePath} — skipping`);
  }
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-allow-private-address: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-allow-private-address: already up to date");
} else {
  console.log(`[postinstall] patch-ap-allow-private-address: patched ${patched}/${checked} file(s)`);
}
