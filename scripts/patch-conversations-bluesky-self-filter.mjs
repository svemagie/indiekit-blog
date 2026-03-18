/**
 * Patch: filter out self-interactions from own Bluesky account.
 *
 * When posts are syndicated to Bluesky, the resulting Bluesky post can
 * generate notifications (likes, reposts, mentions) attributed to the
 * site owner's own account. These self-interactions should not appear
 * as inbound interactions.
 *
 * Two-pronged fix:
 *  1. scheduler.js  – skip storing new notifications where the author
 *                     handle matches BLUESKY_IDENTIFIER / BLUESKY_HANDLE.
 *  2. conversations.js – strip self-authored items from API responses so
 *                        any already-stored entries are hidden immediately.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const schedulerCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-conversations/lib/polling/scheduler.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-conversations/lib/polling/scheduler.js",
];

const controllerCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-conversations/lib/controllers/conversations.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-conversations/lib/controllers/conversations.js",
];

const patchSpecs = [
  {
    name: "conversations-bluesky-scheduler-self-filter",
    candidates: schedulerCandidates,
    marker: "// Skip self-interactions",
    oldSnippet: `    let stored = 0;

    for (const notification of result.items) {
      let canonicalUrl = null;`,
    newSnippet: `    let stored = 0;

    // Derive own handle from identifier (strip leading @)
    const ownBskyHandle = (credentials.identifier || "").replace(/^@+/, "").toLowerCase();

    for (const notification of result.items) {
      // Skip self-interactions (e.g. own account liking/reposting a syndicated post)
      if (ownBskyHandle && (notification.author?.handle || "").toLowerCase() === ownBskyHandle) {
        const webmentionSenderCandidates = [
          "node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/controllers/webmention-sender.js",
          "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-webmention-sender/lib/controllers/webmention-sender.js",
        ];

        const patchSpecs = [
          {
            name: "conversations-bluesky-scheduler-self-filter",
            candidates: schedulerCandidates,
            marker: "// Skip self-interactions",
            oldSnippet: `    let stored = 0;

            for (const notification of result.items) {
              let canonicalUrl = null;`,
            newSnippet: `    let stored = 0;

            // Derive own handle from identifier (strip leading @)
            const ownBskyHandle = (credentials.identifier || "").replace(/^@+/, "").toLowerCase();

            for (const notification of result.items) {
              // Skip self-interactions (e.g. own account liking/reposting a syndicated post)
              if (ownBskyHandle && (notification.author?.handle || "").toLowerCase() === ownBskyHandle) {
                continue;
              }

              let canonicalUrl = null;`,
          },
          {
            name: "conversations-bluesky-api-self-filter",
            candidates: controllerCandidates,
            marker: "// Filter out self-interactions from own Bluesky account",
            oldSnippet: `    const children = items.map(conversationItemToJf2);

            response.set("Cache-Control", "public, max-age=60");`,
            newSnippet: `    // Filter out self-interactions from own Bluesky account
            const _selfBskyHandle = (process.env.BLUESKY_IDENTIFIER || process.env.BLUESKY_HANDLE || "").replace(/^@+/, "").toLowerCase();
            if (_selfBskyHandle) {
              const _selfBskyUrl = "https://bsky.app/profile/" + _selfBskyHandle;
              items = items.filter(item => (item.author?.url || "").toLowerCase() !== _selfBskyUrl);
            }

            const children = items.map(conversationItemToJf2);

            response.set("Cache-Control", "public, max-age=60");`,
          },
          {
            name: "webmention-sender-bluesky-self-filter",
            candidates: webmentionSenderCandidates,
            marker: "// Filter out self Bluesky profile from webmention results",
            oldSnippet: `  return posts.map((post) => ({
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    checkedFiles.add(filePath);

            newSnippet: `  // Filter out self Bluesky profile from webmention results
          const _selfBskyHandle = (process.env.BLUESKY_IDENTIFIER || process.env.BLUESKY_HANDLE || "").replace(/^@+/, "").toLowerCase();
          const _selfBskyUrl = _selfBskyHandle ? "https://bsky.app/profile/" + _selfBskyHandle : null;
          return posts.map((post) => {
            let details = post.properties["webmention-results"]?.details || null;
            if (_selfBskyUrl && details && typeof details === "object") {
              // Remove any sent/failed/skipped entries where source is own Bluesky profile
              for (const key of ["sent", "failed", "skipped"]) {
                if (Array.isArray(details[key])) {
                  details[key] = details[key].filter(entry => (entry.source || entry.author || "").toLowerCase() !== _selfBskyUrl);
                }
              }
            }
            return {
              url: post.properties.url,
              sent: post.properties["webmention-results"]?.sent || 0,
              failed: post.properties["webmention-results"]?.failed || 0,
              skipped: post.properties["webmention-results"]?.skipped || 0,
              details,
              timestamp: post.properties["webmention-results"]?.timestamp,
            };
          });`,
          },
    const source = await readFile(filePath, "utf8");

    if (spec.marker && source.includes(spec.marker)) {
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
      continue;
    }

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);

    if (updated === source) {
      continue;
    }

    await writeFile(filePath, updated, "utf8");
    patchedFiles.add(filePath);
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (checkedFiles.size === 0) {
  console.log("[postinstall] No conversations bluesky self-filter files found");
} else if (patchedFiles.size === 0) {
  console.log("[postinstall] conversations bluesky self-filter patches already applied");
} else {
  console.log(
    `[postinstall] Patched conversations bluesky self-filter in ${patchedFiles.size}/${checkedFiles.size} file(s)`,
  );
}
