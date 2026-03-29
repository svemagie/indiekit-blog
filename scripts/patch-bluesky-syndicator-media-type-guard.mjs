/**
 * Patch: guard uploadMedia() against non-image HTTP responses.
 *
 * Root cause:
 *   uploadMedia() fetches a photo URL and uploads whatever it receives to Bluesky
 *   without checking the Content-Type. If the internal fetch returns an HTML page
 *   (e.g. a login redirect from an auth-protected endpoint), the blob is uploaded
 *   with encoding "text/html". uploadBlob() accepts it, but app.bsky.feed.post
 *   record validation then rejects the post:
 *     "Expected 'image/*' (got 'text/html') at $.record.embed.images[0].image.mimeType"
 *
 *   uploadImageFromUrl() has this guard already (it returns null for non-image
 *   responses) but uploadMedia() does not.
 *
 * Fix:
 *   1. Add a content-type guard to uploadMedia() — throw if response is not image/*.
 *   2. Wrap per-photo uploads in post() with try/catch and filter out failures,
 *      so one bad photo doesn't block the entire syndication.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const TARGET =
  "node_modules/@rmdes/indiekit-syndicator-bluesky/lib/bluesky.js";

const MARKER = "// bsky-media-type-guard patch";

// ---------------------------------------------------------------------------
// 1. Guard in uploadMedia(): reject non-image content types
// ---------------------------------------------------------------------------
const OLD_ENCODING = `      let blob = await mediaResponse.blob();
      let encoding = mediaResponse.headers.get("Content-Type");

      if (encoding?.startsWith("image/")) {`;

const NEW_ENCODING = `      let blob = await mediaResponse.blob();
      let encoding = mediaResponse.headers.get("Content-Type");

      // Reject non-image responses (e.g. HTML login redirects) ${MARKER}
      if (!encoding || !encoding.startsWith("image/")) {
        throw new Error(\`uploadMedia: non-image content-type "\${encoding}" for \${mediaUrl}\`); ${MARKER}
      }

      if (encoding?.startsWith("image/")) {`;

// ---------------------------------------------------------------------------
// 2. Per-photo error handling in post(): skip failed uploads instead of
//    propagating a broken blob into the images array.
// ---------------------------------------------------------------------------
const OLD_UPLOADS = `      if (properties.photo) {
        const photos = properties.photo.slice(0, 4);
        const uploads = photos.map(async (photo) => ({
          alt: photo.alt || "",
          image: await this.uploadMedia(photo, me),
        }));
        images = await Promise.all(uploads);
      }`;

const NEW_UPLOADS = `      if (properties.photo) {
        const photos = properties.photo.slice(0, 4);
        const uploads = photos.map(async (photo) => { ${MARKER}
          try {
            const image = await this.uploadMedia(photo, me);
            return image ? { alt: photo.alt || "", image } : null; ${MARKER}
          } catch (err) {
            console.error(\`[Bluesky] uploadMedia failed for \${photo.url}: \${err.message}\`); ${MARKER}
            return null; ${MARKER}
          }
        });
        images = (await Promise.all(uploads)).filter(Boolean); ${MARKER}
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

if (!(await exists(TARGET))) {
  console.log("[postinstall] patch-bluesky-syndicator-media-type-guard: target not found");
  process.exit(0);
}

const source = await readFile(TARGET, "utf8");

if (source.includes(MARKER)) {
  console.log("[postinstall] patch-bluesky-syndicator-media-type-guard: already applied");
  process.exit(0);
}

let updated = source;
let changed = false;

if (updated.includes(OLD_ENCODING)) {
  updated = updated.replace(OLD_ENCODING, NEW_ENCODING);
  changed = true;
} else {
  console.warn("[postinstall] patch-bluesky-syndicator-media-type-guard: encoding block not found — skipping");
}

if (updated.includes(OLD_UPLOADS)) {
  updated = updated.replace(OLD_UPLOADS, NEW_UPLOADS);
  changed = true;
} else {
  console.warn("[postinstall] patch-bluesky-syndicator-media-type-guard: uploads block not found — skipping");
}

if (!changed || updated === source) {
  console.log("[postinstall] patch-bluesky-syndicator-media-type-guard: no changes applied");
  process.exit(0);
}

await writeFile(TARGET, updated, "utf8");
console.log(`[postinstall] Applied patch-bluesky-syndicator-media-type-guard to ${TARGET}`);
