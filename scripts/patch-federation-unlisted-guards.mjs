import { access, readFile, writeFile } from "node:fs/promises";

// activitypub index.js and federation-setup.js unlisted guards are now
// built into the fork — only endpoint-syndicate (separate package) needs patching.

const endpointSyndicateCandidates = [
  "node_modules/@indiekit/endpoint-syndicate/lib/utils.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-syndicate/lib/utils.js",
];

const patchSpecs = [
  {
    name: "endpoint-syndicate-source-url-unlisted-guard",
    candidates: endpointSyndicateCandidates,
    oldSnippet: `    postData = await postsCollection.findOne({
      "properties.url": url,
    });`,
    newSnippet: `    postData = await postsCollection.findOne({
      "properties.url": url,
      "properties.post-status": {
        $ne: "draft",
      },
      // Exclude unlisted posts from automatic syndication/federation.
      "properties.visibility": {
        $ne: "unlisted",
      },
    });`,
  },
  {
    name: "endpoint-syndicate-get-post-data-pending-unlisted-guard",
    candidates: endpointSyndicateCandidates,
    oldSnippet: `        "properties.post-status": {
          $ne: "draft",
        },
      })`,
    newSnippet: `        "properties.post-status": {
          $ne: "draft",
        },
        // Exclude unlisted posts from automatic syndication/federation.
        "properties.visibility": {
          $ne: "unlisted",
        },
      })`,
  },
  {
    name: "endpoint-syndicate-get-all-post-data-unlisted-guard",
    candidates: endpointSyndicateCandidates,
    oldSnippet: `      "properties.post-status": {
        $ne: "draft",
      },
    })`,
    newSnippet: `      "properties.post-status": {
        $ne: "draft",
      },
      // Exclude unlisted posts from automatic syndication/federation.
      "properties.visibility": {
        $ne: "unlisted",
      },
    })`,
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

    let updated = source;
    let replacements = 0;

    if (source.includes(spec.oldSnippet)) {
      updated = source.replace(spec.oldSnippet, spec.newSnippet);
      replacements = 1;
    }

    if (replacements === 0 || updated === source) {
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
  console.log("[postinstall] No federation patch targets found");
} else if (patchedFiles.size === 0) {
  console.log("[postinstall] federation unlisted guards already patched");
} else {
  console.log(
    `[postinstall] Patched federation unlisted guards in ${patchedFiles.size}/${checkedFiles.size} file(s)`,
  );
}
