/**
 * Patch: extend Fedify's HTTP Signature time window from 1 hour to 12 hours.
 *
 * Root cause:
 *   Mastodon retries failed inbox deliveries with the SAME original HTTP
 *   Signature. Before the raw-body digest fix, every Mastodon delivery was
 *   being rejected (Digest mismatch), so Mastodon queued them all for retry.
 *   Once the digest fix is applied and the server restarts, those retried
 *   deliveries arrive with signatures that are now > 1 hour old. Fedify's
 *   default signatureTimeWindow of { hours: 1 } rejects them with
 *   "Date is too far in the past", logged as "Failed to verify the request's
 *   HTTP Signatures." at ERROR level.
 *
 * Fix:
 *   Pass signatureTimeWindow: { hours: 12 } to createFederation so that
 *   retried Mastodon deliveries (which can arrive hours later) are still
 *   accepted. The signature must still be cryptographically valid — extending
 *   the window only avoids replay-window false positives.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
];

const MARKER = "// signature time window fix";

const OLD_SNIPPET = `  const federation = createFederation({
    kv,
    queue,
  });`;

const NEW_SNIPPET = `  const federation = createFederation({
    kv,
    queue,
    // Accept signatures up to 12 h old. // signature time window fix
    // Mastodon retries failed deliveries with the original signature, which
    // can be hours old by the time the delivery succeeds.
    signatureTimeWindow: { hours: 12 },
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

  if (source.includes(MARKER)) {
    continue;
  }

  if (!source.includes(OLD_SNIPPET)) {
    console.log(`[postinstall] patch-ap-signature-time-window: snippet not found in ${filePath}`);
    continue;
  }

  const updated = source.replace(OLD_SNIPPET, NEW_SNIPPET);

  if (updated === source) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-signature-time-window to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-signature-time-window: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-signature-time-window: already up to date");
} else {
  console.log(`[postinstall] patch-ap-signature-time-window: patched ${patched}/${checked} file(s)`);
}
