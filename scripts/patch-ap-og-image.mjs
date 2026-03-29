/**
 * Patch: fix OG image URL generation in ActivityPub jf2-to-as2.js.
 *
 * Root cause (original):
 *   jf2-to-as2.js used a date-based URL regex to extract the post slug, which
 *   never matches this blog's flat URLs (/articles/slug/ vs /articles/2024/.../slug/).
 *   The image property was never set, so no preview card reached Mastodon.
 *
 * Fix (v2 — this patch):
 *   For posts with a photo attachment (properties.photo), use the photo URL
 *   directly as the preview image — Eleventy does NOT generate /og/*.png for
 *   photo post types.
 *   For all other post types (replies, bookmarks, articles) fall back to
 *   /og/{slug}.png, which Eleventy does generate.
 *
 *   Both jf2ToActivityStreams() (plain JSON-LD) and jf2ToAS2Activity() (Fedify
 *   vocab objects) are patched. Handles all known file states:
 *     - Original upstream code  (ogMatch / ogMatchF variable names)
 *     - v1 patch                (ogSlug / ogSlugF + // og-image fix comments)
 *     - Already v2              (// og-image-v2 marker) → skip
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
];

const MARKER = "// og-image-v2";

// ---------------------------------------------------------------------------
// Match the OG image block in jf2ToActivityStreams.
// Handles both the original upstream code (ogMatch) and the v1 patch (ogSlug).
// ---------------------------------------------------------------------------
const CN_BLOCK_RE =
  /  const og(?:Slug|Match) = postUrl && postUrl\.match\([^\n]+\n  if \(og(?:Slug|Match)\) \{[\s\S]*?\n  \}/;

// Match the OG image block in jf2ToAS2Activity (ogMatchF / ogSlugF variants).
const AS2_BLOCK_RE =
  /  const og(?:SlugF|MatchF) = postUrl && postUrl\.match\([^\n]+\n  if \(og(?:SlugF|MatchF)\) \{[\s\S]*?\n  \}/;

// ---------------------------------------------------------------------------
// v2 replacements:
//   1. Use properties.photo[0] URL for photo posts (resolveMediaUrl handles
//      relative paths; guessMediaType detects jpeg/png/webp).
//   2. Fall back to /og/{slug}.png for replies, bookmarks, articles.
//
// Template literal escaping (patch string → injected JS source):
//   \\/ → \/   (regex escaped slash)
//   [\\\w-] → [\w-]  (word-char class)
//   \`\${ → `${   (start of injected template literal)
// ---------------------------------------------------------------------------
const NEW_CN = `  const _ogPhoto = properties.photo && asArray(properties.photo)[0]; // og-image-v2
  const _ogPhotoUrl = _ogPhoto && (typeof _ogPhoto === "string" ? _ogPhoto : _ogPhoto.url); // og-image-v2
  const ogSlug = postUrl && postUrl.match(/\\/([\\\w-]+)\\/?$/)?.[1]; // og-image-v2
  const _ogUrl = _ogPhotoUrl
    ? resolveMediaUrl(_ogPhotoUrl, publicationUrl) // og-image-v2
    : ogSlug ? \`\${publicationUrl.replace(/\\/$/, "")}/og/\${ogSlug}.png\` : null; // og-image-v2
  if (_ogUrl) { // og-image-v2
    object.image = {
      type: "Image",
      url: _ogUrl, // og-image-v2
      mediaType: _ogPhotoUrl ? guessMediaType(_ogUrl) : "image/png", // og-image-v2
    };
  }`;

const NEW_AS2 = `  const _ogPhotoF = properties.photo && asArray(properties.photo)[0]; // og-image-v2
  const _ogPhotoUrlF = _ogPhotoF && (typeof _ogPhotoF === "string" ? _ogPhotoF : _ogPhotoF.url); // og-image-v2
  const ogSlugF = postUrl && postUrl.match(/\\/([\\\w-]+)\\/?$/)?.[1]; // og-image-v2
  const _ogUrlF = _ogPhotoUrlF
    ? resolveMediaUrl(_ogPhotoUrlF, publicationUrl) // og-image-v2
    : ogSlugF ? \`\${publicationUrl.replace(/\\/$/, "")}/og/\${ogSlugF}.png\` : null; // og-image-v2
  if (_ogUrlF) { // og-image-v2
    noteOptions.image = new Image({
      url: new URL(_ogUrlF), // og-image-v2
      mediaType: _ogPhotoUrlF ? guessMediaType(_ogUrlF) : "image/png", // og-image-v2
    });
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
  const source = await readFile(filePath, "utf8");

  if (source.includes(MARKER)) {
    console.log(`[postinstall] patch-ap-og-image: already applied to ${filePath}`);
    continue;
  }

  let updated = source;
  let changed = false;

  // Fix the jf2ToActivityStreams OG block
  if (CN_BLOCK_RE.test(updated)) {
    updated = updated.replace(CN_BLOCK_RE, NEW_CN);
    changed = true;
  } else {
    console.warn(
      `[postinstall] patch-ap-og-image: jf2ToActivityStreams OG block not found in ${filePath} — skipping`,
    );
  }

  // Fix the jf2ToAS2Activity OG block
  if (AS2_BLOCK_RE.test(updated)) {
    updated = updated.replace(AS2_BLOCK_RE, NEW_AS2);
    changed = true;
  } else {
    console.warn(
      `[postinstall] patch-ap-og-image: jf2ToAS2Activity OG block not found in ${filePath} — skipping`,
    );
  }

  if (!changed || updated === source) {
    console.log(`[postinstall] patch-ap-og-image: no changes applied to ${filePath}`);
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-og-image to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-og-image: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-og-image: already up to date");
} else {
  console.log(`[postinstall] patch-ap-og-image: patched ${patched}/${checked} file(s)`);
}
