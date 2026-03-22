/**
 * Patch: honour post-status in the microsub compose submitCompose handler.
 *
 * When a post is submitted via the microsub compose form with
 * post-status: draft:
 *   1. Forward the post-status to Micropub so the post is saved as a draft.
 *   2. Suppress all mp-syndicate-to targets — draft posts must never be
 *      syndicated (not to Mastodon, Bluesky, or ActivityPub).
 *
 * The syndicate endpoint already filters out drafts at the DB-query level
 * (patch-federation-unlisted-guards), and the AP syndicator has its own
 * guard (patch-ap-skip-draft-syndication), but preventing syndication
 * targets from being stored in the first place is the cleanest approach.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-microsub/lib/controllers/reader.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-microsub/lib/controllers/reader.js",
];

const patchSpecs = [
  {
    name: "microsub-compose-extract-post-status",
    oldSnippet: [
      `  const syndicateTo = request.body["mp-syndicate-to"];`,
      ``,
      `  // Debug logging`,
      `  console.info(`,
      `    "[Microsub] submitCompose request.body:",`,
      `    JSON.stringify(request.body),`,
      `  );`,
      `  console.info("[Microsub] Extracted values:", {`,
      `    content,`,
      `    inReplyTo,`,
      `    likeOf,`,
      `    repostOf,`,
      `    bookmarkOf,`,
      `    syndicateTo,`,
      `  });`,
    ].join("\n"),
    newSnippet: [
      `  const syndicateTo = request.body["mp-syndicate-to"];`,
      `  const postStatus = request.body["post-status"];`,
      `  const isDraft = postStatus === "draft";`,
      ``,
      `  // Debug logging`,
      `  console.info(`,
      `    "[Microsub] submitCompose request.body:",`,
      `    JSON.stringify(request.body),`,
      `  );`,
      `  console.info("[Microsub] Extracted values:", {`,
      `    content,`,
      `    inReplyTo,`,
      `    likeOf,`,
      `    repostOf,`,
      `    bookmarkOf,`,
      `    syndicateTo,`,
      `    postStatus,`,
      `  });`,
    ].join("\n"),
  },
  {
    name: "microsub-compose-draft-suppresses-syndication",
    oldSnippet: [
      `  // Add syndication targets`,
      `  if (syndicateTo) {`,
      `    const targets = Array.isArray(syndicateTo) ? syndicateTo : [syndicateTo];`,
      `    for (const target of targets) {`,
      `      micropubData.append("mp-syndicate-to", target);`,
      `    }`,
      `  }`,
    ].join("\n"),
    newSnippet: [
      `  // Set post status (e.g. draft) — must be appended before syndication logic`,
      `  if (postStatus) {`,
      `    micropubData.append("post-status", postStatus);`,
      `  }`,
      ``,
      `  // Add syndication targets — suppressed entirely for draft posts`,
      `  if (syndicateTo && !isDraft) {`,
      `    const targets = Array.isArray(syndicateTo) ? syndicateTo : [syndicateTo];`,
      `    for (const target of targets) {`,
      `      micropubData.append("mp-syndicate-to", target);`,
      `    }`,
      `  }`,
    ].join("\n"),
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
  for (const filePath of candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    checkedFiles.add(filePath);

    const source = await readFile(filePath, "utf8");

    if (source.includes(spec.newSnippet)) {
      // Already patched
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
      console.warn(
        `[postinstall] Skipping ${spec.name} patch for ${filePath}: upstream format changed`,
      );
      continue;
    }

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);
    await writeFile(filePath, updated, "utf8");
    patchedFiles.add(filePath);
  }
}

if (checkedFiles.size === 0) {
  console.log("[postinstall] No microsub reader files found for draft guard patch");
} else if (patchedFiles.size === 0) {
  console.log("[postinstall] microsub compose draft guard already applied");
} else {
  console.log(
    `[postinstall] Patched microsub compose draft guard in ${patchedFiles.size} file(s)`,
  );
}
