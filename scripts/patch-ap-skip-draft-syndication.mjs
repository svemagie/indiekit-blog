/**
 * Patch: add a post-status === "draft" guard to the ActivityPub syndicator's
 * syndicate() method, mirroring the existing visibility === "unlisted" guard.
 *
 * Without this patch, a draft post that somehow reaches the AP syndicator
 * directly (bypassing the syndicate-endpoint DB-level filter) would be
 * federated to followers.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
];

const oldSnippet = `        const visibility = String(properties?.visibility || "").toLowerCase();
        if (visibility === "unlisted") {
          console.info(
            "[ActivityPub] Skipping federation for unlisted post: " +
              (properties?.url || "unknown"),
          );
          await logActivity(self._collections.ap_activities, {
            direction: "outbound",
            type: "Syndicate",
            actorUrl: self._publicationUrl,
            objectUrl: properties?.url,
            summary: "Syndication skipped: post visibility is unlisted",
          }).catch(() => {});
          return undefined;
        }`;

const newSnippet = `        const postStatus = String(properties?.["post-status"] || "").toLowerCase();
        if (postStatus === "draft") {
          console.info(
            "[ActivityPub] Skipping federation for draft post: " +
              (properties?.url || "unknown"),
          );
          await logActivity(self._collections.ap_activities, {
            direction: "outbound",
            type: "Syndicate",
            actorUrl: self._publicationUrl,
            objectUrl: properties?.url,
            summary: "Syndication skipped: post is a draft",
          }).catch(() => {});
          return undefined;
        }

        const visibility = String(properties?.visibility || "").toLowerCase();
        if (visibility === "unlisted") {
          console.info(
            "[ActivityPub] Skipping federation for unlisted post: " +
              (properties?.url || "unknown"),
          );
          await logActivity(self._collections.ap_activities, {
            direction: "outbound",
            type: "Syndicate",
            actorUrl: self._publicationUrl,
            objectUrl: properties?.url,
            summary: "Syndication skipped: post visibility is unlisted",
          }).catch(() => {});
          return undefined;
        }`;

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

  if (source.includes(newSnippet)) {
    continue;
  }

  if (!source.includes(oldSnippet)) {
    console.warn(
      `[postinstall] Skipping ap-skip-draft-syndication patch for ${filePath}: upstream format changed`,
    );
    continue;
  }

  const updated = source.replace(oldSnippet, newSnippet);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No AP endpoint files found for draft guard patch");
} else if (patched === 0) {
  console.log("[postinstall] ap-skip-draft-syndication patch already applied");
} else {
  console.log(
    `[postinstall] Patched AP draft syndication guard in ${patched} file(s)`,
  );
}
