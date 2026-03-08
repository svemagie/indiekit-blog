import { access, readFile, writeFile } from "node:fs/promises";

const endpointSyndicateCandidates = [
  "node_modules/@indiekit/endpoint-syndicate/lib/utils.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-syndicate/lib/utils.js",
];

const activityPubIndexCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
];

const activityPubFederationSetupCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
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
  {
    name: "activitypub-syndicator-unlisted-guard",
    candidates: activityPubIndexCandidates,
    oldSnippet: `      async syndicate(properties) {
        if (!self._federation) {
          return undefined;
        }

        try {`,
    newSnippet: `      async syndicate(properties) {
        if (!self._federation) {
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
        }

        try {`,
  },
  {
    name: "activitypub-outbox-unlisted-guard",
    candidates: activityPubFederationSetupCandidates,
    oldSnippet: `        const pageSize = 20;
        const skip = cursor ? Number.parseInt(cursor, 10) : 0;
        const total = await postsCollection.countDocuments();

        const posts = await postsCollection
          .find()`,
    newSnippet: `        const pageSize = 20;
        const skip = cursor ? Number.parseInt(cursor, 10) : 0;
        const federationVisibilityQuery = {
          "properties.post-status": { $ne: "draft" },
          "properties.visibility": { $ne: "unlisted" },
        };
        const total = await postsCollection.countDocuments(
          federationVisibilityQuery,
        );

        const posts = await postsCollection
          .find(federationVisibilityQuery)`,
  },
  {
    name: "activitypub-outbox-counter-unlisted-guard",
    candidates: activityPubFederationSetupCandidates,
    oldSnippet: `    .setCounter(async (ctx, identifier) => {
      if (identifier !== handle) return 0;
      const postsCollection = collections.posts;
      if (!postsCollection) return 0;
      return await postsCollection.countDocuments();
    })`,
    newSnippet: `    .setCounter(async (ctx, identifier) => {
      if (identifier !== handle) return 0;
      const postsCollection = collections.posts;
      if (!postsCollection) return 0;
      return await postsCollection.countDocuments({
        "properties.post-status": { $ne: "draft" },
        "properties.visibility": { $ne: "unlisted" },
      });
    })`,
  },
  {
    name: "activitypub-object-dispatch-unlisted-guard",
    candidates: activityPubFederationSetupCandidates,
    oldSnippet: `    const post = await collections.posts.findOne({ "properties.url": postUrl });
    if (!post) return null;`,
    newSnippet: `    const post = await collections.posts.findOne({ "properties.url": postUrl });
    if (!post) return null;
    if (post?.properties?.["post-status"] === "draft") return null;
    if (post?.properties?.visibility === "unlisted") return null;`,
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
