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
 *
 * 3. Fetch blog pages from the public URL directly. INTERNAL_FETCH_URL is for
 *    indiekit API calls only — blog pages are served by an external host
 *    (e.g. GitHub Pages) that the jail can reach over the public URL.
 *    Override with WEBMENTION_LIVEFETCH_URL if a local static server is
 *    available (e.g. http://10.x.x.x; will send Host: <public-hostname>).
 *
 * 4. Log the actual fetchUrl and response preview when h-entry check fails,
 *    so the cause is visible in the logs.
 *
 * Handles the original upstream code, the older retry patch, v1/v2/v3
 * livefetch patches, and upgrades any prior version to v4.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const filePath =
  "node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/controllers/webmention-sender.js";

const patchMarker = "// [patched:livefetch:v4]";
const v3PatchMarker = "// [patched:livefetch:v3]";
const v2PatchMarker = "// [patched:livefetch:v2]";
const oldPatchMarker = "// [patched:livefetch]";

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

// State left by older patch-webmention-sender-retry.mjs (which only fixed the
// fetch-failure path but not the live-fetch-always path)
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
            // Page not yet available — skip and retry on next poll rather than
            // permanently marking this post as sent with zero webmentions.
            console.log(\`[webmention] Page not yet available for \${postUrl}, will retry next poll\`);
            continue;
          }
          console.log(\`[webmention] No content to process for \${postUrl}\`);
          await markWebmentionsSent(postsCollection, postUrl, { sent: [], failed: [], skipped: [] });
          continue;
        }`;

const newBlock = `        // [patched:livefetch:v4] Always fetch the live page so template-rendered links
        // (u-in-reply-to, u-like-of, u-bookmark-of, u-repost-of, etc.) are included.
        // Stored content only has the post body, not these microformat links.
        //
        // Fetch from the public URL directly. INTERNAL_FETCH_URL is for indiekit API
        // calls only — blog pages are served by an external host (e.g. GitHub Pages)
        // that the jail can reach fine over the public URL.
        // Override with WEBMENTION_LIVEFETCH_URL if a local static server is available.
        let contentToProcess = "";
        try {
          const _wmLivefetchBase = (process.env.WEBMENTION_LIVEFETCH_URL || "").replace(/\\/+$/, "");
          const _wmPublicBase = (process.env.PUBLICATION_URL || process.env.SITE_URL || "").replace(/\\/+$/, "");
          const fetchUrl = (_wmLivefetchBase && _wmPublicBase && postUrl.startsWith(_wmPublicBase))
            ? _wmLivefetchBase + postUrl.slice(_wmPublicBase.length)
            : postUrl;
          if (fetchUrl !== postUrl) {
            console.log(\`[webmention] Fetching \${postUrl} via WEBMENTION_LIVEFETCH_URL: \${fetchUrl}\`);
          }
          const _ac = new AbortController();
          const _timeout = setTimeout(() => _ac.abort(), 15000);
          const _fetchOpts = { signal: _ac.signal };
          if (fetchUrl !== postUrl && _wmPublicBase) {
            _fetchOpts.headers = { host: new URL(_wmPublicBase).hostname };
          }
          const pageResponse = await fetch(fetchUrl, _fetchOpts);
          clearTimeout(_timeout);
          if (pageResponse.ok) {
            const _html = await pageResponse.text();
            // Validate the response is a real post page, not an error/502 page.
            // extractLinks scopes to .h-entry, so if there's no .h-entry the page
            // is not a valid post (e.g. nginx 502, login redirect, error template).
            if (_html.includes("h-entry") /* [patched:hentry-syntax] */ || _html.includes("h-entry ")) {
              contentToProcess = _html;
            } else {
              console.log(\`[webmention] Live page for \${postUrl} has no .h-entry — skipping (fetched: \${fetchUrl}, preview: \${_html.slice(0, 200).replace(/[\\n\\r]+/g, " ")})\`);
            }
          } else {
            console.log(\`[webmention] Live page returned \${pageResponse.status} for \${fetchUrl}\`);
          }
        } catch (error) {
          console.log(\`[webmention] Could not fetch live page for \${postUrl}: \${error.message}\`);
        }

        if (!contentToProcess) {
          // Live page missing or invalid — skip without marking sent so the next
          // poll retries. Don't fall back to stored content because it lacks the
          // template-rendered microformat links we need.
          console.log(\`[webmention] No valid page for \${postUrl}, will retry next poll\`);
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
  console.log("[patch-webmention-sender-livefetch] Already patched (v4)");
  process.exit(0);
}

// Upgrade v3 → v4: replace the whole fetch+log block within the existing v3 marker.
// Match the unique INTERNAL_FETCH_URL reference to isolate the block to replace.
if (source.includes(v3PatchMarker)) {
  const v3InternalBase = `          const _wmInternalBase = (() => {
            if (process.env.INTERNAL_FETCH_URL) return process.env.INTERNAL_FETCH_URL.replace(/\\/+$/, "");
            const port = process.env.PORT || "3000";
            return \`http://localhost:\${port}\`;
          })();
          const _wmPublicBase = (process.env.PUBLICATION_URL || process.env.SITE_URL || "").replace(/\\/+$/, "");
          const fetchUrl = (_wmPublicBase && postUrl.startsWith(_wmPublicBase))
            ? _wmInternalBase + postUrl.slice(_wmPublicBase.length)
            : postUrl;
          if (fetchUrl !== postUrl) {
            console.log(\`[webmention] Fetching \${postUrl} via internal URL: \${fetchUrl}\`);
          }
          const _ac = new AbortController();
          const _timeout = setTimeout(() => _ac.abort(), 15000);
          // When fetching via internal URL (nginx), send the public Host header so
          // nginx can route to the correct virtual host.
          // Without this, nginx sees the internal IP as Host and serves the wrong vhost.
          const _fetchOpts = { signal: _ac.signal };
          if (fetchUrl !== postUrl && _wmPublicBase) {
            _fetchOpts.headers = { host: new URL(_wmPublicBase).hostname };
          }
          const pageResponse = await fetch(fetchUrl, _fetchOpts);`;

  const v4FetchBlock = `          const _wmLivefetchBase = (process.env.WEBMENTION_LIVEFETCH_URL || "").replace(/\\/+$/, "");
          const _wmPublicBase = (process.env.PUBLICATION_URL || process.env.SITE_URL || "").replace(/\\/+$/, "");
          const fetchUrl = (_wmLivefetchBase && _wmPublicBase && postUrl.startsWith(_wmPublicBase))
            ? _wmLivefetchBase + postUrl.slice(_wmPublicBase.length)
            : postUrl;
          if (fetchUrl !== postUrl) {
            console.log(\`[webmention] Fetching \${postUrl} via WEBMENTION_LIVEFETCH_URL: \${fetchUrl}\`);
          }
          const _ac = new AbortController();
          const _timeout = setTimeout(() => _ac.abort(), 15000);
          const _fetchOpts = { signal: _ac.signal };
          if (fetchUrl !== postUrl && _wmPublicBase) {
            _fetchOpts.headers = { host: new URL(_wmPublicBase).hostname };
          }
          const pageResponse = await fetch(fetchUrl, _fetchOpts);`;

  const v3DiagLine = `              console.log(\`[webmention] Live page for \${postUrl} has no .h-entry — skipping (fetched: \${fetchUrl}, host-sent: \${_fetchOpts.headers?.host ?? "(none)"}, preview: \${_html.slice(0, 200).replace(/[\\n\\r]+/g, " ")})\`);`;
  const v4DiagLine = `              console.log(\`[webmention] Live page for \${postUrl} has no .h-entry — skipping (fetched: \${fetchUrl}, preview: \${_html.slice(0, 200).replace(/[\\n\\r]+/g, " ")})\`);`;

  let upgraded = source
    .replace(v3PatchMarker, patchMarker)
    .replace(v3InternalBase, v4FetchBlock)
    .replace(v3DiagLine, v4DiagLine);

  // Also update the comment line that mentions INTERNAL_FETCH_URL
  upgraded = upgraded.replace(
    "        // Rewrite public URL to internal URL for jailed setups where the server\n        // can't reach its own public HTTPS URL.\n        // Send public Host header on internal fetches so nginx routes to the right vhost.",
    "        //\n        // Fetch from the public URL directly. INTERNAL_FETCH_URL is for indiekit API\n        // calls only — blog pages are served by an external host (e.g. GitHub Pages)\n        // that the jail can reach fine over the public URL.\n        // Override with WEBMENTION_LIVEFETCH_URL if a local static server is available."
  );

  if (!upgraded.includes(patchMarker)) {
    console.warn("[patch-webmention-sender-livefetch] v3→v4 upgrade validation failed, skipping");
    process.exit(0);
  }

  await writeFile(filePath, upgraded, "utf8");
  console.log("[patch-webmention-sender-livefetch] Upgraded v3 → v4 (public URL fetch, no INTERNAL_FETCH_URL)");
  process.exit(0);
}

// Earlier versions (v1/v2 or unpatched): extract block and do full replacement.
let oldPatchBlock = null;
if (source.includes(v2PatchMarker)) {
  const startIdx = source.lastIndexOf("        // [patched:livefetch:v2]");
  const endMarker = "          continue;\n        }";
  const endSearch = source.indexOf(endMarker, startIdx);
  if (startIdx !== -1 && endSearch !== -1) {
    oldPatchBlock = source.slice(startIdx, endSearch + endMarker.length);
  }
} else if (source.includes(oldPatchMarker)) {
  const startIdx = source.lastIndexOf("        // [patched:livefetch]");
  const endMarker = "          continue;\n        }";
  const endSearch = source.indexOf(endMarker, startIdx);
  if (startIdx !== -1 && endSearch !== -1) {
    oldPatchBlock = source.slice(startIdx, endSearch + endMarker.length);
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
console.log("[patch-webmention-sender-livefetch] Patched successfully (v4)");
