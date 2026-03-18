/**
 * Patch: add proper to/cc addressing to Like and Announce activities.
 *
 * Root cause:
 *   jf2ToAS2Activity() builds Like and Announce activities without adding
 *   the followers collection to `cc`. Mastodon's shared inbox uses `to`/`cc`
 *   to route activities to local followers — without `cc: followers`, the
 *   activities are accepted (HTTP 202) but silently dropped.
 *
 * Fix:
 *   Add `to: Public, cc: followers` to Like activities and
 *   `cc: followers` to Announce activities, matching the addressing
 *   already used for Create/Note activities.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
];

const MARKER = "// like/announce addressing fix";

// --- Like: plain JSON-LD (jf2ToActivityStreams) ---

const OLD_LIKE_PLAIN = `  if (postType === "like") {
    // Serve like posts as Note objects for AP content negotiation.
    // Returning a bare Like activity breaks Mastodon's authorize_interaction
    // flow because it expects a content object (Note/Article), not an activity.
    const likeOf = properties["like-of"];
    const postUrl = resolvePostUrl(properties.url, publicationUrl);
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: postUrl,
      attributedTo: actorUrl,
      published: properties.published,
      url: postUrl,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: [\`\${actorUrl.replace(/\\/$/, "")}/followers\`],
      content: \`\\u2764\\uFE0F <a href="\${likeOf}">\${likeOf}</a>\`,
    };
  }`;

// Plain JSON-LD like is already correctly addressed (to: Public, cc: followers)
// so we only need the marker. We skip patching if the marker is present.

// --- Repost: plain JSON-LD (jf2ToActivityStreams) ---

const OLD_REPOST_PLAIN = `  if (postType === "repost") {
    // Same rationale as like — serve as Note for content negotiation.
    const repostOf = properties["repost-of"];
    const postUrl = resolvePostUrl(properties.url, publicationUrl);
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: postUrl,
      attributedTo: actorUrl,
      published: properties.published,
      url: postUrl,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: [\`\${actorUrl.replace(/\\/$/, "")}/followers\`],
      content: \`\\u{1F501} <a href="\${repostOf}">\${repostOf}</a>\`,
    };
  }`;

// Plain JSON-LD repost is already correctly addressed too.

// --- Like: Fedify vocab (jf2ToAS2Activity) ---

const OLD_LIKE_FEDIFY = `  if (postType === "like") {
    const likeOf = properties["like-of"];
    if (!likeOf) return null;
    return new Like({
      actor: actorUri,
      object: new URL(likeOf),
    });
  }`;

const NEW_LIKE_FEDIFY = `  if (postType === "like") {
    const likeOf = properties["like-of"];
    if (!likeOf) return null;
    const followersUrl = \`\${actorUrl.replace(/\\/$/, "")}/followers\`; // like/announce addressing fix
    return new Like({
      actor: actorUri,
      object: new URL(likeOf),
      to: new URL("https://www.w3.org/ns/activitystreams#Public"),
      cc: new URL(followersUrl),
    });
  }`;

// --- Announce: Fedify vocab (jf2ToAS2Activity) ---

const OLD_ANNOUNCE_FEDIFY = `  if (postType === "repost") {
    const repostOf = properties["repost-of"];
    if (!repostOf) return null;
    return new Announce({
      actor: actorUri,
      object: new URL(repostOf),
      to: new URL("https://www.w3.org/ns/activitystreams#Public"),
    });
  }`;

const NEW_ANNOUNCE_FEDIFY = `  if (postType === "repost") {
    const repostOf = properties["repost-of"];
    if (!repostOf) return null;
    const followersUrl = \`\${actorUrl.replace(/\\/$/, "")}/followers\`; // like/announce addressing fix
    return new Announce({
      actor: actorUri,
      object: new URL(repostOf),
      to: new URL("https://www.w3.org/ns/activitystreams#Public"),
      cc: new URL(followersUrl),
    });
  }`;

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

  let updated = source;
  let changed = false;

  if (source.includes(OLD_LIKE_FEDIFY)) {
    updated = updated.replace(OLD_LIKE_FEDIFY, NEW_LIKE_FEDIFY);
    changed = true;
  } else {
    console.log(`[postinstall] patch-ap-like-announce-addressing: Like snippet not found in ${filePath}`);
  }

  if (source.includes(OLD_ANNOUNCE_FEDIFY)) {
    updated = updated.replace(OLD_ANNOUNCE_FEDIFY, NEW_ANNOUNCE_FEDIFY);
    changed = true;
  } else {
    console.log(`[postinstall] patch-ap-like-announce-addressing: Announce snippet not found in ${filePath}`);
  }

  if (!changed || updated === source) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-like-announce-addressing to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-like-announce-addressing: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-like-announce-addressing: already up to date");
} else {
  console.log(`[postinstall] patch-ap-like-announce-addressing: patched ${patched}/${checked} file(s)`);
}
