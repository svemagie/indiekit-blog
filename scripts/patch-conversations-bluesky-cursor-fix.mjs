/**
 * Patch: fix Bluesky notification polling cursor misuse.
 *
 * The Bluesky `listNotifications` API cursor is a PAGINATION cursor —
 * it moves BACKWARDS in time (older pages). Using it as a "poll since
 * last check" marker causes each poll to fetch progressively older
 * notifications. Over time the cursor drifts far into the past, beyond
 * Bluesky's notification history window, so every poll returns an empty
 * list and no new interactions are ever stored.
 *
 * Fix: remove the cursor from the fetchBlueskyNotifications call so it
 * always fetches the latest notifications (most-recent page), and rely
 * on platform_id deduplication (upsertConversationItem) to avoid storing
 * duplicates. Also clear any stale bluesky_cursor from the DB state so
 * the dashboard no longer shows a misleading 2024 timestamp.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const schedulerCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-conversations/lib/polling/scheduler.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-conversations/lib/polling/scheduler.js",
];

const patchSpecs = [
  {
    name: "conversations-bluesky-cursor-fix-fetch",
    candidates: schedulerCandidates,
    marker: "// cursor intentionally omitted",
    oldSnippet: `    const result = await fetchBlueskyNotifications({
      identifier: credentials.identifier,
      password: credentials.password,
      cursor: state.bluesky_cursor,
    });`,
    newSnippet: `    const result = await fetchBlueskyNotifications({
      identifier: credentials.identifier,
      password: credentials.password,
      // cursor intentionally omitted — listNotifications cursor paginates
      // BACKWARDS (older pages), not forwards. Passing it drifts polling
      // into the past until no notifications are returned. Rely on
      // platform_id deduplication (upsertConversationItem) instead.
    });`,
  },
  {
    name: "conversations-bluesky-cursor-fix-save",
    candidates: schedulerCandidates,
    marker: "// bluesky_cursor cleared",
    oldSnippet: `    // Update cursor and status
    const updateFields = {
      bluesky_last_poll: new Date().toISOString(),
      bluesky_last_error: null,
    };
    if (result.cursor) {
      updateFields.bluesky_cursor = result.cursor;
    }`,
    newSnippet: `    // Update status — bluesky_cursor cleared (see fetch comment above)
    const updateFields = {
      bluesky_last_poll: new Date().toISOString(),
      bluesky_last_error: null,
      bluesky_cursor: null, // bluesky_cursor cleared — not used for incremental polling
    };`,
  },
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const checkedFiles = new Set();
const patchedFiles = new Set();

for (const spec of patchSpecs) {
  let foundAnyTarget = false;

  for (const filePath of spec.candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    checkedFiles.add(filePath);

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
  console.log("[postinstall] No conversations bluesky cursor-fix files found");
} else if (patchedFiles.size === 0) {
  console.log("[postinstall] conversations bluesky cursor-fix patches already applied");
} else {
  console.log(
    `[postinstall] Patched conversations bluesky cursor-fix in ${patchedFiles.size}/${checkedFiles.size} file(s)`,
  );
}
