/**
 * Patch: fix OG image URL generation in ActivityPub jf2-to-as2.js.
 *
 * Root cause:
 *   Both 842fc5af and 45f8ba9 versions of jf2-to-as2.js try to extract the
 *   post date from the URL using a regex that expects date-based URLs like
 *   /articles/2024/01/15/slug/ but this blog uses flat URLs like /articles/slug/.
 *   The regex never matches so the `image` property is never set — no OG image
 *   preview card reaches Mastodon or other fediverse servers.
 *
 * Fix:
 *   Replace the date-from-URL regex with an approach that:
 *     1. Extracts the slug from the last path segment of the post URL.
 *     2. Reads the date from properties.published (ISO-8601 string).
 *   Constructs /og/{year}-{month}-{day}-{slug}.png — the filename pattern that
 *   the Eleventy build generates for static OG preview images.
 *
 *   Both jf2ToActivityStreams() (plain JSON-LD) and jf2ToAS2Activity() (Fedify
 *   vocab objects) are patched. Both 842fc5af and 45f8ba9 variants are handled
 *   so the patch works regardless of which commit npm install resolved.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
];

const MARKER = "// og-image fix";

// ---------------------------------------------------------------------------
// Use JS regex patterns to locate the OG image blocks.
// Both 842fc5af and 45f8ba9 share the same variable names (ogMatch / ogMatchF)
// and the same if-block structure, differing only in the URL construction.
//
// Pattern: matches from "const ogMatch[F] = postUrl && postUrl.match(" to the
// closing "}" (2-space indent) of the if block.
// ---------------------------------------------------------------------------
const CN_BLOCK_RE =
  /  const ogMatch = postUrl && postUrl\.match\([^\n]+\n  if \(ogMatch\) \{[\s\S]*?\n  \}/;

const AS2_BLOCK_RE =
  /  const ogMatchF = postUrl && postUrl\.match\([^\n]+\n  if \(ogMatchF\) \{[\s\S]*?\n  \}/;

// ---------------------------------------------------------------------------
// Replacement: extract slug from URL last segment, date from published ISO string.
// Build /og/{year}-{month}-{day}-{slug}.png to match the Eleventy OG filenames.
//
// Template literal note: backslashes in regex literals inside the injected code
// are doubled here so they survive the template literal → string conversion:
//   \\\/ → \/ (escaped slash in regex)
//   \\d  → \d (digit class)
//   [\\\w-] → [\w-] (word char class)
// ---------------------------------------------------------------------------
const NEW_CN = `  const ogSlug = postUrl && postUrl.match(/\\/([\\\w-]+)\\/?$/)?.[1]; // og-image fix
  const ogPub = properties.published && properties.published.match(/^(\\d{4})-(\\d{2})-(\\d{2})/); // og-image fix
  if (ogSlug && ogPub) { // og-image fix
    object.image = {
      type: "Image",
      url: \`\${publicationUrl.replace(/\\/$/, "")}/og/\${ogPub[1]}-\${ogPub[2]}-\${ogPub[3]}-\${ogSlug}.png\`, // og-image fix
      mediaType: "image/png",
    };
  }`;

const NEW_AS2 = `  const ogSlugF = postUrl && postUrl.match(/\\/([\\\w-]+)\\/?$/)?.[1]; // og-image fix
  const ogPubF = properties.published && properties.published.match(/^(\\d{4})-(\\d{2})-(\\d{2})/); // og-image fix
  if (ogSlugF && ogPubF) { // og-image fix
    noteOptions.image = new Image({
      url: new URL(\`\${publicationUrl.replace(/\\/$/, "")}/og/\${ogPubF[1]}-\${ogPubF[2]}-\${ogPubF[3]}-\${ogSlugF}.png\`), // og-image fix
      mediaType: "image/png",
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
