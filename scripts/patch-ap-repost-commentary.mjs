/**
 * Patch: include commentary in ActivityPub output for reposts.
 *
 * Root cause (two bugs in jf2-to-as2.js):
 *
 *   1. jf2ToAS2Activity() (Fedify delivery) always generates a bare
 *      `Announce { object: <external-url> }` for repost posts, even when the
 *      post has a body (the author's commentary).  External URLs like
 *      fromjason.xyz don't serve ActivityPub JSON, so Mastodon receives the
 *      Announce but cannot fetch the object — the activity is silently dropped
 *      from followers' timelines.  The post only appears when searched because
 *      Mastodon then fetches the blog's own AP Note representation directly.
 *
 *   2. jf2ToActivityStreams() (content negotiation / search) returns a Note
 *      whose `content` field is hardcoded to `🔁 <url>`, completely ignoring
 *      any commentary text in properties.content.
 *
 * Fix:
 *   - jf2ToAS2Activity(): if the repost has commentary, skip the early
 *     Announce return and fall through to the existing Create(Note) path so
 *     the text is included and the activity is a proper federated Note.
 *     Pure reposts (no commentary) keep the Announce behaviour.
 *   - jf2ToAS2Activity() content block: add a `repost` branch that formats
 *     the note as `<commentary><br><br>🔁 <url>` (mirroring bookmark/like).
 *   - jf2ToActivityStreams(): extract commentary from properties.content and
 *     prepend it to the note content when present.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
];

const MARKER = "// repost-commentary fix";
// Also present when the fork has this change baked in natively (no comment marker needed)
const NATIVE_MARKER = '} else if (postType === "repost") {';

// ---------------------------------------------------------------------------
// Fix A – jf2ToActivityStreams(): add commentary variable before the return
// ---------------------------------------------------------------------------
const OLD_CN_VARS = `    const repostOf = properties["repost-of"];
    const postUrl = resolvePostUrl(properties.url, publicationUrl);
    return {
      "@context": "https://www.w3.org/ns/activitystreams",`;

const NEW_CN_VARS = `    const repostOf = properties["repost-of"];
    const postUrl = resolvePostUrl(properties.url, publicationUrl);
    const commentary = linkifyUrls(properties.content?.html || properties.content || ""); // repost-commentary fix
    return {
      "@context": "https://www.w3.org/ns/activitystreams",`;

// ---------------------------------------------------------------------------
// Fix B – jf2ToActivityStreams(): use commentary in the content field
// ---------------------------------------------------------------------------
const OLD_CN_CONTENT = `      cc: [\`\${actorUrl.replace(/\\/$/, "")}/followers\`],
      content: \`\\u{1F501} <a href="\${repostOf}">\${repostOf}</a>\`,`;

const NEW_CN_CONTENT = `      cc: [\`\${actorUrl.replace(/\\/$/, "")}/followers\`],
      content: commentary // repost-commentary fix
        ? \`\${commentary}<br><br>\\u{1F501} <a href="\${repostOf}">\${repostOf}</a>\` // repost-commentary fix
        : \`\\u{1F501} <a href="\${repostOf}">\${repostOf}</a>\`, // repost-commentary fix`;

// ---------------------------------------------------------------------------
// Fix C – jf2ToAS2Activity(): only Announce when there is no commentary;
//         fall through to Create(Note) when commentary is present
// ---------------------------------------------------------------------------
const OLD_AS2_ANNOUNCE = `    if (!repostOf) return null;
    return new Announce({
      actor: actorUri,
      object: new URL(repostOf),
      to: new URL("https://www.w3.org/ns/activitystreams#Public"),
    });
  }`;

const NEW_AS2_ANNOUNCE = `    if (!repostOf) return null;
    const repostContent = properties.content?.html || properties.content || ""; // repost-commentary fix
    if (!repostContent) { // repost-commentary fix
      return new Announce({
        actor: actorUri,
        object: new URL(repostOf),
        to: new URL("https://www.w3.org/ns/activitystreams#Public"),
      });
    } // repost-commentary fix
    // Has commentary — fall through to Create(Note) so the text is federated // repost-commentary fix
  }`;

// ---------------------------------------------------------------------------
// Fix D – jf2ToAS2Activity() content block: add repost branch
// ---------------------------------------------------------------------------
const OLD_AS2_CONTENT = `  } else {
    noteOptions.content = linkifyUrls(properties.content?.html || properties.content || "");
  }`;

const NEW_AS2_CONTENT = `  } else if (postType === "repost") { // repost-commentary fix
    const repostUrl = properties["repost-of"]; // repost-commentary fix
    const commentary = linkifyUrls(properties.content?.html || properties.content || ""); // repost-commentary fix
    noteOptions.content = commentary // repost-commentary fix
      ? \`\${commentary}<br><br>\\u{1F501} <a href="\${repostUrl}">\${repostUrl}</a>\` // repost-commentary fix
      : \`\\u{1F501} <a href="\${repostUrl}">\${repostUrl}</a>\`; // repost-commentary fix
  } else {
    noteOptions.content = linkifyUrls(properties.content?.html || properties.content || "");
  }`;

// ---------------------------------------------------------------------------

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

  if (source.includes(MARKER) || source.includes(NATIVE_MARKER)) {
    console.log(`[postinstall] patch-ap-repost-commentary: already applied to ${filePath}`);
    continue;
  }

  let updated = source;
  let changed = false;

  // Apply each replacement, warn if the old string is not found
  const replacements = [
    ["Fix A (CN vars)", OLD_CN_VARS, NEW_CN_VARS],
    ["Fix B (CN content)", OLD_CN_CONTENT, NEW_CN_CONTENT],
    ["Fix C (AS2 announce)", OLD_AS2_ANNOUNCE, NEW_AS2_ANNOUNCE],
    ["Fix D (AS2 content block)", OLD_AS2_CONTENT, NEW_AS2_CONTENT],
  ];

  for (const [label, oldStr, newStr] of replacements) {
    if (updated.includes(oldStr)) {
      updated = updated.replace(oldStr, newStr);
      changed = true;
    } else {
      console.warn(`[postinstall] patch-ap-repost-commentary: ${label} snippet not found in ${filePath} — skipping`);
    }
  }

  if (!changed || updated === source) {
    console.log(`[postinstall] patch-ap-repost-commentary: no changes applied to ${filePath}`);
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-repost-commentary to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-repost-commentary: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-repost-commentary: already up to date");
} else {
  console.log(`[postinstall] patch-ap-repost-commentary: patched ${patched}/${checked} file(s)`);
}
