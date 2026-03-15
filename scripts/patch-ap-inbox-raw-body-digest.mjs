/**
 * Patch: preserve raw body bytes through the AP inbox buffer guard so that
 * Fedify's HTTP Signature Digest verification passes.
 *
 * Root cause:
 *   patch-inbox-skip-view-activity-parse.mjs buffers the request body for
 *   application/activity+json requests (needed to detect PeerTube View
 *   activities before Fedify parses them). It stores the parsed JSON in
 *   req.body. fromExpressRequest() then reconstructs the body for Fedify via
 *   JSON.stringify(req.body).
 *
 *   Fedify 2.x verifies the HTTP Signature "Digest: SHA-256=..." header that
 *   Mastodon (and most other AP servers) include with every inbox POST.
 *   The digest is computed over the EXACT original request bytes. Re-encoding
 *   the body via JSON.stringify() produces different bytes (different key
 *   ordering, whitespace, Unicode escaping), so the digest check fails and
 *   Fedify silently rejects every inbound Like, Announce, and Create activity
 *   from Mastodon. The activity never reaches the inbox handlers and is never
 *   stored in ap_activities — so conversations/AP shows zero interactions.
 *
 * Fix (two changes to federation-bridge.js):
 *
 * 1. In createFedifyMiddleware buffer guard: after the for-await loop, store
 *    the original Buffer in req._rawBody before JSON-parsing it into req.body.
 *
 * 2. In fromExpressRequest: when req._rawBody is available, pass it directly
 *    to new Request() instead of JSON.stringify(req.body). This gives Fedify
 *    the original bytes so its SHA-256 digest check matches the Digest header.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-bridge.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-bridge.js",
];

const MARKER = "// raw body digest fix";

const patchSpecs = [
  // Patch A: store raw bytes in req._rawBody alongside req.body
  {
    name: "raw-body-store",
    oldSnippet: `        try {
          req.body = JSON.parse(Buffer.concat(_chunks).toString("utf8"));
        } catch {
          req.body = {};
        }`,
    newSnippet: `        const _raw = Buffer.concat(_chunks); // raw body digest fix
        req._rawBody = _raw; // Preserve original bytes for Fedify HTTP Signature Digest verification
        try {
          req.body = JSON.parse(_raw.toString("utf8"));
        } catch {
          req.body = {};
        }`,
  },

  // Patch B: use req._rawBody in fromExpressRequest when available
  {
    name: "from-express-request-use-raw-body",
    oldSnippet: `    // PeerTube activity+json body fix
    if (ct.includes("application/json") || ct.includes("activity+json") || ct.includes("ld+json")) {
      body = JSON.stringify(req.body);
    }`,
    newSnippet: `    // PeerTube activity+json body fix
    if (ct.includes("application/json") || ct.includes("activity+json") || ct.includes("ld+json")) {
      // Use original raw bytes when available (set by createFedifyMiddleware buffer guard).
      // JSON.stringify() changes byte layout, breaking Fedify's HTTP Signature Digest check.
      body = req._rawBody || JSON.stringify(req.body); // raw body digest fix
    }`,
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

  if (source.includes(MARKER)) {
    continue;
  }

  let filePatched = false;

  for (const spec of patchSpecs) {
    if (!source.includes(spec.oldSnippet)) {
      console.log(`[postinstall] patch-ap-inbox-raw-body-digest: ${spec.name} snippet not found in ${filePath}`);
      continue;
    }

    source = source.replace(spec.oldSnippet, spec.newSnippet);
    filePatched = true;
    console.log(`[postinstall] Applied ${spec.name} to ${filePath}`);
  }

  if (filePatched) {
    await writeFile(filePath, source, "utf8");
    patched += 1;
  }
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-inbox-raw-body-digest: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-inbox-raw-body-digest: already up to date");
} else {
  console.log(`[postinstall] patch-ap-inbox-raw-body-digest: patched ${patched}/${checked} file(s)`);
}
