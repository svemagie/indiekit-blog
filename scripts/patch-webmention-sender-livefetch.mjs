/**
 * Patch @rmdes/indiekit-endpoint-webmention-sender controller to:
 *
 * 1. Always fetch the live page instead of using stored post content.
 *    The stored content (post.properties.content.html) is just the post body —
 *    it never contains template-rendered links like u-in-reply-to, u-like-of,
 *    u-bookmark-of, u-repost-of. Only the live HTML has those.
 *
 * 2. Don't permanently mark a post as webmention-sent when the live page
 *    is unreachable (e.g. deploy still in progress). Skip it silently so
 *    the next poll retries it.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const filePath =
  "node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/controllers/webmention-sender.js";

const patchMarker = "// [patched:livefetch]";

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

const newBlock = `        // [patched:livefetch] Always fetch the live page so template-rendered links
        // (u-in-reply-to, u-like-of, u-bookmark-of, u-repost-of, etc.) are included.
        // Stored content only has the post body, not these microformat links.
        let contentToProcess = "";
        try {
          const _ac = new AbortController();
          const _timeout = setTimeout(() => _ac.abort(), 15000);
          const pageResponse = await fetch(postUrl, { signal: _ac.signal });
          clearTimeout(_timeout);
          if (pageResponse.ok) {
            contentToProcess = await pageResponse.text();
          } else {
            console.log(\`[webmention] Live page returned \${pageResponse.status} for \${postUrl}\`);
          }
        } catch (error) {
          console.log(\`[webmention] Could not fetch live page for \${postUrl}: \${error.message}\`);
        }

        // Fall back to stored content if live page is unavailable
        if (!contentToProcess) {
          contentToProcess = postContent;
        }

        if (!contentToProcess) {
          // Page not reachable yet (deploy in progress?) — skip without marking sent
          // so the next poll retries it.
          console.log(\`[webmention] No content available for \${postUrl}, will retry next poll\`);
          continue;
        }`;

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
  console.log("[patch-webmention-sender-livefetch] Already patched");
  process.exit(0);
}

if (!source.includes(originalBlock)) {
  console.warn(
    "[patch-webmention-sender-livefetch] Target block not found — upstream format may have changed, skipping"
  );
  process.exit(0);
}

const patched = source.replace(originalBlock, newBlock);

if (!patched.includes(patchMarker)) {
  console.warn("[patch-webmention-sender-livefetch] Patch validation failed, skipping");
  process.exit(0);
}

await writeFile(filePath, patched, "utf8");
console.log("[patch-webmention-sender-livefetch] Patched successfully");
