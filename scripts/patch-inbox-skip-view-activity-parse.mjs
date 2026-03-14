/**
 * Patch: skip PeerTube View (WatchAction) activities before Fedify parses them.
 *
 * PeerTube's View activities embed Schema.org extensions such as
 * `InteractionCounter` that Fedify's JSON-LD deserializer doesn't recognise.
 * This causes a hard "Failed to parse activity" error *before* any inbox
 * listener is reached, so the .on(View, ...) no-op handler added earlier
 * never fires.
 *
 * Fix: in createFedifyMiddleware (federation-bridge.js), add an early-return
 * guard that checks req.body.type === "View" and responds 200 immediately,
 * so Fedify never attempts to parse the activity. Returning 200 (rather than
 * 4xx) prevents the sending server from retrying.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-bridge.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-bridge.js",
];

const patchSpecs = [
  {
    name: "inbox-skip-view-activity-parse",
    marker: "// PeerTube View parse skip",
    oldSnippet: `  return async (req, res, next) => {
    try {
      const request = fromExpressRequest(req);`,
    newSnippet: `  return async (req, res, next) => {
    try {
      // Short-circuit PeerTube View (WatchAction) activities before Fedify
      // attempts JSON-LD parsing. Fedify's vocab parser throws on PeerTube's
      // Schema.org extensions (e.g. InteractionCounter), causing a
      // "Failed to parse activity" error. Return 200 to prevent retries.
      // PeerTube View parse skip
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
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (checkedFiles.size === 0) {
  console.log("[postinstall] No federation-bridge files found for View activity parse-skip patch");
} else if (patchedFiles.size === 0) {
  console.log("[postinstall] inbox-skip-view-activity-parse patch already applied");
} else {
  console.log(
    `[postinstall] Patched inbox-skip-view-activity-parse in ${patchedFiles.size}/${checkedFiles.size} file(s)`,
  );
}
