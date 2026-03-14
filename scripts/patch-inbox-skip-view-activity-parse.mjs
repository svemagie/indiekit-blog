/**
 * Patch: skip PeerTube View (WatchAction) activities before Fedify parses them.
 *
 * PeerTube's View activities embed Schema.org extensions such as
 * `InteractionCounter` that Fedify's JSON-LD deserializer doesn't recognise.
 * This causes a hard "Failed to parse activity" error *before* any inbox
 * listener is reached, so the .on(View, ...) no-op handler added earlier
 * never fires.
 *
 * Root cause of the previous (broken) patch: Express's JSON body parser only
 * handles `application/json`, not `application/activity+json`. So `req.body`
 * is always undefined for ActivityPub inbox POSTs, meaning the check
 * `req.body?.type === "View"` never matched and Fedify still received the raw
 * stream.
 *
 * Fix (two changes to federation-bridge.js):
 *
 * 1. In createFedifyMiddleware: for ActivityPub POST requests where the body
 *    hasn't been parsed yet, buffer the raw stream, JSON-parse it, and store
 *    the result on req.body before the guard runs. Then check type === "View"
 *    and return 200 if so (preventing retries from the sender).
 *
 * 2. In fromExpressRequest: extend the content-type check to also handle
 *    `application/activity+json` and `application/ld+json` bodies (i.e. use
 *    JSON.stringify(req.body) to reconstruct the stream), so that non-View
 *    ActivityPub activities are forwarded correctly to Fedify.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-bridge.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-bridge.js",
];

const patchSpecs = [
  // --- Patch 1: extend fromExpressRequest to handle activity+json bodies ---
  {
    name: "from-express-request-activity-json-fix",
    marker: "// PeerTube activity+json body fix",
    oldSnippet: `    if (ct.includes("application/json")) {
      body = JSON.stringify(req.body);
    } else if (ct.includes("application/x-www-form-urlencoded")) {`,
    newSnippet: `    // PeerTube activity+json body fix
    if (ct.includes("application/json") || ct.includes("activity+json") || ct.includes("ld+json")) {
      body = JSON.stringify(req.body);
    } else if (ct.includes("application/x-www-form-urlencoded")) {`,
  },

  // --- Patch 2a: replace the old (broken) v1 guard with the buffering v2 guard ---
  // Handles the case where the previous version of this script was already run.
  {
    name: "inbox-skip-view-activity-parse-v2",
    marker: "// PeerTube View parse skip v2",
    oldSnippet: `      // Short-circuit PeerTube View (WatchAction) activities before Fedify
      // attempts JSON-LD parsing. Fedify's vocab parser throws on PeerTube's
      // Schema.org extensions (e.g. InteractionCounter), causing a
      // "Failed to parse activity" error. Return 200 to prevent retries.
      // PeerTube View parse skip
      if (req.method === "POST" && req.body?.type === "View") {
        return res.status(200).end();
      }
      const request = fromExpressRequest(req);`,
    newSnippet: `      // Short-circuit PeerTube View (WatchAction) activities before Fedify
      // attempts JSON-LD parsing. Fedify's vocab parser throws on PeerTube's
      // Schema.org extensions (e.g. InteractionCounter), causing a
      // "Failed to parse activity" error. Return 200 to prevent retries.
      // PeerTube View parse skip v2
      const _apct = req.headers["content-type"] || "";
      if (
        req.method === "POST" &&
        !req.body &&
        req.readable &&
        (_apct.includes("activity+json") || _apct.includes("ld+json"))
      ) {
        // Express doesn't parse application/activity+json, so buffer it ourselves.
        const _chunks = [];
        for await (const _chunk of req) {
          _chunks.push(Buffer.isBuffer(_chunk) ? _chunk : Buffer.from(_chunk));
        }
        try {
          req.body = JSON.parse(Buffer.concat(_chunks).toString("utf8"));
        } catch {
          req.body = {};
        }
      }
      if (req.method === "POST" && req.body?.type === "View") {
        return res.status(200).end();
      }
      const request = fromExpressRequest(req);`,
  },

  // --- Patch 2b: apply the buffering v2 guard on a fresh (unpatched) file ---
  // Handles the case where neither v1 nor v2 patch has been applied yet.
  {
    name: "inbox-skip-view-activity-parse-v2-fresh",
    marker: "// PeerTube View parse skip v2",
    oldSnippet: `  return async (req, res, next) => {
    try {
      const request = fromExpressRequest(req);`,
    newSnippet: `  return async (req, res, next) => {
    try {
      // Short-circuit PeerTube View (WatchAction) activities before Fedify
      // attempts JSON-LD parsing. Fedify's vocab parser throws on PeerTube's
      // Schema.org extensions (e.g. InteractionCounter), causing a
      // "Failed to parse activity" error. Return 200 to prevent retries.
      // PeerTube View parse skip v2
      const _apct = req.headers["content-type"] || "";
      if (
        req.method === "POST" &&
        !req.body &&
        req.readable &&
        (_apct.includes("activity+json") || _apct.includes("ld+json"))
      ) {
        // Express doesn't parse application/activity+json, so buffer it ourselves.
        const _chunks = [];
        for await (const _chunk of req) {
          _chunks.push(Buffer.isBuffer(_chunk) ? _chunk : Buffer.from(_chunk));
        }
        try {
          req.body = JSON.parse(Buffer.concat(_chunks).toString("utf8"));
        } catch {
          req.body = {};
        }
      }
      if (req.method === "POST" && req.body?.type === "View") {
        return res.status(200).end();
      }
      const request = fromExpressRequest(req);`,
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

const checkedFiles = new Set();
const patchedFiles = new Set();

for (const spec of patchSpecs) {
  let foundAnyTarget = false;

  for (const filePath of candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    checkedFiles.add(filePath);

    const source = await readFile(filePath, "utf8");

    if (spec.marker && source.includes(spec.marker)) {
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
      continue;
    }

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);

    if (updated === source) {
      continue;
    }

    await writeFile(filePath, updated, "utf8");
    patchedFiles.add(filePath);
    console.log(`[postinstall] Applied ${spec.name} to ${filePath}`);
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (checkedFiles.size === 0) {
  console.log("[postinstall] No federation-bridge files found for View activity parse-skip patch");
} else if (patchedFiles.size === 0) {
  console.log("[postinstall] inbox-skip-view-activity-parse patch already up to date");
} else {
  console.log(
    `[postinstall] Patched inbox-skip-view-activity-parse in ${patchedFiles.size}/${checkedFiles.size} file(s)`,
  );
}
