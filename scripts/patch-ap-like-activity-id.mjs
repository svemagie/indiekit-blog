/**
 * Patch: add a canonical `id` to the Like activity produced by jf2ToAS2Activity.
 *
 * Per ActivityPub §6.2.1, activities sent from a server SHOULD have an `id`
 * URI so that remote servers can dereference them. The current Like activity
 * has no `id`, which means it cannot be looked up by its URL.
 *
 * Fix:
 *   In jf2-to-as2.js, derive the mount path from the actor URL and construct
 *   a canonical id at /activitypub/activities/like/{post-path}.
 *
 * This enables:
 *   - The Like activity dispatcher (patch-ap-like-activity-dispatcher.mjs) to
 *     serve the Like at its canonical URL.
 *   - Remote servers to dereference the Like activity by its id.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
];

const MARKER = "// ap-like-activity-id patch";

const OLD_SNIPPET = `      return new Like({
        actor: actorUri,
        object: new URL(likeOfUrl),
        to: new URL("https://www.w3.org/ns/activitystreams#Public"),
      });`;

const NEW_SNIPPET = `      // ap-like-activity-id patch
      // Derive mount path from actor URL (e.g. "/activitypub") so we can
      // construct the canonical id without needing mountPath in options.
      const actorPath = new URL(actorUrl).pathname; // e.g. "/activitypub/users/sven"
      const mp = actorPath.replace(/\\/users\\/[^/]+$/, ""); // → "/activitypub"
      const postRelPath = (properties.url || "")
        .replace(publicationUrl.replace(/\\/$/, ""), "")
        .replace(/^\\//, "")
        .replace(/\\/$/, ""); // e.g. "likes/9acc3"
      const likeActivityId = \`\${publicationUrl.replace(/\\/$/, "")}\${mp}/activities/like/\${postRelPath}\`;
      return new Like({
        id: new URL(likeActivityId),
        actor: actorUri,
        object: new URL(likeOfUrl),
        to: new URL("https://www.w3.org/ns/activitystreams#Public"),
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
  let source = await readFile(filePath, "utf8");

  if (source.includes(MARKER)) {
    continue; // already patched
  }

  if (!source.includes(OLD_SNIPPET)) {
    console.log(`[postinstall] patch-ap-like-activity-id: snippet not found in ${filePath}`);
    continue;
  }

  source = source.replace(OLD_SNIPPET, NEW_SNIPPET);
  await writeFile(filePath, source, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-like-activity-id to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-like-activity-id: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-like-activity-id: already up to date");
} else {
  console.log(`[postinstall] patch-ap-like-activity-id: patched ${patched}/${checked} file(s)`);
}
