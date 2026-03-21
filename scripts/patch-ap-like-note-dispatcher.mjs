/**
 * Patch: REVERT the wrong ap-like-note-dispatcher change in federation-setup.js.
 *
 * The previous version of this script served AP-likes as fake Notes at the
 * Note dispatcher URL, which violated ActivityPub semantics (Like activities
 * should not be served as Notes).
 *
 * This rewritten version removes that fake-Note block and restores the original
 * resolvePost() logic. The correct AP-compliant fixes are handled by:
 *   - patch-ap-like-activity-id.mjs    (adds id to Like activity)
 *   - patch-ap-like-activity-dispatcher.mjs  (registers Like object dispatcher)
 *   - patch-ap-url-lookup-api-like.mjs  (returns likeOf URL for AP-likes in widget)
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
];

// Marker from the old wrong patch — if this is present, we need to revert
const WRONG_PATCH_MARKER = "// ap-like-note-dispatcher patch";

// Clean up the Like import comment added by the old patch
const OLD_IMPORT = `  Like, // Like import for ap-like-note-dispatcher patch`;
const NEW_IMPORT = `  Like,`;

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

  if (!source.includes(WRONG_PATCH_MARKER)) {
    // Already reverted (or never applied)
    continue;
  }

  let modified = false;

  // 1. Clean up Like import comment
  if (source.includes(OLD_IMPORT)) {
    source = source.replace(OLD_IMPORT, NEW_IMPORT);
    modified = true;
  }

  // 2. Remove fake Note block — use regex to avoid escaping issues with
  //    unicode escapes and template literals inside the block.
  //    Match from the opening comment through `return await activity.getObject();`
  const fakeNoteBlock = /    \/\/ Only Create activities wrap Note\/Article objects\.\n[\s\S]*?    return await activity\.getObject\(\);/;
  if (fakeNoteBlock.test(source)) {
    source = source.replace(
      fakeNoteBlock,
      `    // Only Create activities wrap Note/Article objects\n    if (!(activity instanceof Create)) return null;\n    return await activity.getObject();`,
    );
    modified = true;
  }

  if (modified) {
    await writeFile(filePath, source, "utf8");
    patched += 1;
    console.log(`[postinstall] Reverted ap-like-note-dispatcher patch in ${filePath}`);
  }
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-like-note-dispatcher: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-like-note-dispatcher: already up to date");
} else {
  console.log(`[postinstall] patch-ap-like-note-dispatcher: reverted ${patched}/${checked} file(s)`);
}
