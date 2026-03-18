/**
 * Patch @rmdes/indiekit-endpoint-webmention-sender controller to not silently
 * mark posts as webmention-sent when the live page fetch fails.
 *
 * Root cause: when a post has no stored content (likes, bookmarks, reposts),
 * the controller tries to fetch the published URL. If the fetch fails (page not
 * yet deployed), it marks the post as webmention-sent with empty results — and
 * it is never retried. This patch skips those posts instead so they are picked
 * up on the next poll once the page is live.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/controllers/webmention-sender.js",
];

const marker = "Page not yet available";

const oldSnippet = `        // If no content, try fetching the published page
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

const newSnippet = `        // If no content, try fetching the published page
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
            // Page not yet available — skip and retry on next poll rather than
            // permanently marking this post as sent with zero webmentions.
            console.log(\`[webmention] Page not yet available for \${postUrl}, will retry next poll\`);
            continue;
          }
          console.log(\`[webmention] No content to process for \${postUrl}\`);
          await markWebmentionsSent(postsCollection, postUrl, { sent: [], failed: [], skipped: [] });
          continue;
        }`;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let filesChecked = 0;
let filesPatched = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  filesChecked += 1;

  const source = await readFile(filePath, "utf8");

  if (source.includes(marker)) {
    continue;
  }

  if (!source.includes(oldSnippet)) {
    console.log(`[patch] webmention-sender-retry: target snippet not found in ${filePath} (package updated?)`);
    continue;
  }

  const updated = source.replace(oldSnippet, newSnippet);
  await writeFile(filePath, updated, "utf8");
  filesPatched += 1;
}

if (filesChecked === 0) {
  console.log("[patch] webmention-sender-retry: package file not found");
} else if (filesPatched === 0) {
  console.log("[patch] webmention-sender-retry: already applied");
} else {
  console.log(`[patch] webmention-sender-retry: patched ${filesPatched}/${filesChecked} file(s)`);
}
