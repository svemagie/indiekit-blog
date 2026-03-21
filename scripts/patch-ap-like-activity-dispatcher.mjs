/**
 * Patch: register a Fedify Like activity dispatcher in federation-setup.js.
 *
 * Per ActivityPub §3.1, objects with an `id` MUST be dereferenceable at that
 * URI. The Like activities produced by jf2ToAS2Activity (after patch-ap-like-
 * activity-id.mjs adds an id) need a corresponding Fedify object dispatcher so
 * that fetching /activitypub/activities/like/{id} returns the Like activity.
 *
 * Fix:
 *   Add federation.setObjectDispatcher(Like, ...) after the Article dispatcher
 *   in setupObjectDispatchers(). The handler looks up the post, calls
 *   jf2ToAS2Activity, and returns the Like if that's what was produced.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
];

const MARKER = "// ap-like-activity-dispatcher patch";

const OLD_SNIPPET = `  // Article dispatcher
  federation.setObjectDispatcher(
    Article,
    \`\${mountPath}/objects/article/{+id}\`,
    async (ctx, { id }) => {
      const obj = await resolvePost(ctx, id);
      return obj instanceof Article ? obj : null;
    },
  );
}`;

const NEW_SNIPPET = `  // Article dispatcher
  federation.setObjectDispatcher(
    Article,
    \`\${mountPath}/objects/article/{+id}\`,
    async (ctx, { id }) => {
      const obj = await resolvePost(ctx, id);
      return obj instanceof Article ? obj : null;
    },
  );

  // Like activity dispatcher — makes AP-like activities dereferenceable (AP §3.1)
  // ap-like-activity-dispatcher patch
  federation.setObjectDispatcher(
    Like,
    \`\${mountPath}/activities/like/{+id}\`,
    async (ctx, { id }) => {
      if (!collections.posts || !publicationUrl) return null;
      const postUrl = \`\${publicationUrl.replace(/\\/$/, "")}/\${id}\`;
      const post = await collections.posts.findOne({
        "properties.url": { $in: [postUrl, postUrl + "/"] },
      });
      if (!post) return null;
      if (post?.properties?.["post-status"] === "draft") return null;
      if (post?.properties?.visibility === "unlisted") return null;
      if (post.properties?.deleted) return null;
      const actorUrl = ctx.getActorUri(handle).href;
      const activity = await jf2ToAS2Activity(post.properties, actorUrl, publicationUrl);
      return activity instanceof Like ? activity : null;
    },
  );
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
  let source = await readFile(filePath, "utf8");

  if (source.includes(MARKER)) {
    continue; // already patched
  }

  if (!source.includes(OLD_SNIPPET)) {
    console.log(`[postinstall] patch-ap-like-activity-dispatcher: snippet not found in ${filePath}`);
    continue;
  }

  // Ensure Like is imported from @fedify/fedify/vocab (may be absent on fresh installs)
  if (!source.includes("  Like,")) {
    source = source.replace("  Note,", "  Like,\n  Note,");
  }

  source = source.replace(OLD_SNIPPET, NEW_SNIPPET);
  await writeFile(filePath, source, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-like-activity-dispatcher to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-like-activity-dispatcher: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-like-activity-dispatcher: already up to date");
} else {
  console.log(`[postinstall] patch-ap-like-activity-dispatcher: patched ${patched}/${checked} file(s)`);
}
