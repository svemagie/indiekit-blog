/**
 * Patch @rmdes/indiekit-endpoint-webmention-sender controller to:
 *
 * 1. Build synthetic h-entry HTML from stored post properties instead of
 *    fetching the live page. The stored properties already contain all
 *    microformat target URLs (in-reply-to, like-of, bookmark-of, repost-of)
 *    and content.html has inline links — no live page fetch needed.
 *
 *    This fixes unreliable live fetches caused by internal DNS routing
 *    blog.giersig.eu to the indiekit admin nginx (10.100.0.10) which
 *    returns a login page for post URLs.
 *
 * 2. Don't permanently mark a post as webmention-sent when processing
 *    fails. Skip it silently so the next poll retries.
 *
 * Handles the original upstream code, the older retry patch, and all
 * prior livefetch patch versions (v1–v4) via full block replacement.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const filePath =
  "node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/controllers/webmention-sender.js";

const patchMarker = "// [patched:livefetch:v5]";

// Original upstream code
const originalBlock = `        // If no content, try fetching the published page
        let contentToProcess = postContent;
        if (!contentToProcess) {
          try {
            const pageResponse = await fetch(postUrl);
            if (pageResponse.ok) {
              contentToProcess = await pageResponse.text();
            }
          } catch (error) {
            console.log(\`[webmention] Could not fetch \${postUrl}: \${error.message}\`);
          }
        }

        if (!contentToProcess) {
          console.log(\`[webmention] No content to process for \${postUrl}\`);
          await markWebmentionsSent(postsCollection, postUrl, { sent: [], failed: [], skipped: [] });
          continue;
        }`;

// State left by older patch-webmention-sender-retry.mjs
const retryPatchedBlock = `        // If no content, try fetching the published page
        let contentToProcess = postContent;
        let fetchFailed = false;
        if (!contentToProcess) {
          try {
            const pageResponse = await fetch(postUrl);
            if (pageResponse.ok) {
              contentToProcess = await pageResponse.text();
            } else {
              fetchFailed = true;
            }
          } catch (error) {
            fetchFailed = true;
            console.log(\`[webmention] Could not fetch \${postUrl}: \${error.message}\`);
          }
        }

        if (!contentToProcess) {
          if (fetchFailed) {
            console.log(\`[webmention] Page not yet available for \${postUrl}, will retry next poll\`);
            continue;
          }
          console.log(\`[webmention] No content to process for \${postUrl}\`);
          await markWebmentionsSent(postsCollection, postUrl, { sent: [], failed: [], skipped: [] });
          continue;
        }`;

const newBlock = `        // [patched:livefetch:v5] Build synthetic h-entry HTML from stored post properties.
        // The stored properties already contain all microformat target URLs
        // (in-reply-to, like-of, bookmark-of, repost-of) and content.html has inline
        // links — no live page fetch needed, and no exposure to internal DNS issues.
        const _propLinks = {
          "in-reply-to": "u-in-reply-to",
          "like-of": "u-like-of",
          "bookmark-of": "u-bookmark-of",
          "repost-of": "u-repost-of",
          "syndication": "u-syndication",
        };
        const _anchors = [];
        for (const [_prop, _cls] of Object.entries(_propLinks)) {
          const _vals = post.properties[_prop];
          if (!_vals) continue;
          for (const _v of (Array.isArray(_vals) ? _vals : [_vals])) {
            const _href = (typeof _v === "string") ? _v : (_v?.properties?.url?.[0] ?? _v?.value ?? null);
            if (_href && /^https?:\\/\\//.test(_href)) {
              _anchors.push(\`<a class="\${_cls}" href="\${_href}"></a>\`);
            }
          }
        }
        const _bodyHtml = post.properties.content?.html || post.properties.content?.value || "";
        const contentToProcess = \`<div class="h-entry">\${_anchors.join("")}\${_bodyHtml ? \`<div class="e-content">\${_bodyHtml}</div>\` : ""}</div>\`;`;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(filePath))) {
  console.log("[patch-webmention-sender-livefetch] File not found, skipping");
  process.exit(0);
}

const source = await readFile(filePath, "utf8");

if (source.includes(patchMarker)) {
  console.log("[patch-webmention-sender-livefetch] Already patched (v5)");
  process.exit(0);
}

// For v1–v4: extract the old patched block by finding the marker and the
// closing "continue;\n        }" that ends the if (!contentToProcess) block.
const priorMarkers = [
  "// [patched:livefetch:v4]",
  "// [patched:livefetch:v3]",
  "// [patched:livefetch:v2]",
  "// [patched:livefetch]",
];

let oldPatchBlock = null;
for (const marker of priorMarkers) {
  if (!source.includes(marker)) continue;
  const startIdx = source.lastIndexOf(`        ${marker}`);
  const endMarker = "          continue;\n        }";
  const endSearch = source.indexOf(endMarker, startIdx);
  if (startIdx !== -1 && endSearch !== -1) {
    oldPatchBlock = source.slice(startIdx, endSearch + endMarker.length);
    break;
  }
}

const targetBlock = oldPatchBlock
  ? oldPatchBlock
  : source.includes(originalBlock)
    ? originalBlock
    : source.includes(retryPatchedBlock)
      ? retryPatchedBlock
      : null;

if (!targetBlock) {
  console.warn(
    "[patch-webmention-sender-livefetch] Target block not found — upstream format may have changed, skipping"
  );
  process.exit(0);
}

const patched = source.replace(targetBlock, newBlock);

if (!patched.includes(patchMarker)) {
  console.warn("[patch-webmention-sender-livefetch] Patch validation failed, skipping");
  process.exit(0);
}

await writeFile(filePath, patched, "utf8");
console.log("[patch-webmention-sender-livefetch] Patched successfully (v5)");
