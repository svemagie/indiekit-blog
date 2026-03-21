/**
 * Patch: make the /api/ap-url endpoint return the liked post URL for AP-likes.
 *
 * Root cause:
 *   For like posts where like-of is an ActivityPub URL (e.g. a Mastodon status),
 *   the "Also on: Fediverse" widget's authorize_interaction flow needs to send
 *   the user to the original AP object, not to a blog-side Note URL.
 *
 *   The current handler always returns a /activitypub/objects/note/{id} URL,
 *   which 404s for AP-likes (because jf2ToAS2Activity returns a Like activity,
 *   not a Create(Note), so the Note dispatcher returns null).
 *
 * Fix:
 *   Before building the Note/Article URL, check whether the post is an AP-like
 *   (like-of is a URL that responds with application/activity+json). If it is,
 *   return { apUrl: likeOf } so that authorize_interaction opens the original
 *   AP object on the remote instance, where the user can interact with it.
 *
 *   Non-AP likes (like-of is a plain web URL) fall through to the existing
 *   Note URL logic unchanged.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
];

const MARKER = "// ap-url-lookup-api-like patch";

const OLD_SNIPPET = `        // Determine the AP object type (mirrors jf2-to-as2.js logic)
        const postType = post.properties?.["post-type"];
        const isArticle = postType === "article" && !!post.properties?.name;
        const objectType = isArticle ? "article" : "note";`;

const NEW_SNIPPET = `        // Determine the AP object type (mirrors jf2-to-as2.js logic)
        const postType = post.properties?.["post-type"];

        // For AP-likes: the widget should open the liked post on the remote instance.
        // We detect AP URLs the same way as jf2-to-as2.js: HEAD with activity+json Accept.
        // ap-url-lookup-api-like patch
        if (postType === "like") {
          const likeOf = post.properties?.["like-of"] || "";
          if (likeOf) {
            let isAp = false;
            try {
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 3000);
              const r = await fetch(likeOf, {
                method: "HEAD",
                headers: { Accept: "application/activity+json, application/ld+json" },
                signal: ctrl.signal,
              });
              clearTimeout(tid);
              const ct = r.headers.get("content-type") || "";
              isAp = ct.includes("activity+json") || ct.includes("ld+json");
            } catch { /* network error — treat as non-AP */ }
            if (isAp) {
              res.set("Cache-Control", "public, max-age=60");
              return res.json({ apUrl: likeOf });
            }
          }
        }

        const isArticle = postType === "article" && !!post.properties?.name;
        const objectType = isArticle ? "article" : "note";`;

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
    console.log(`[postinstall] patch-ap-url-lookup-api-like: snippet not found in ${filePath}`);
    continue;
  }

  source = source.replace(OLD_SNIPPET, NEW_SNIPPET);
  await writeFile(filePath, source, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-url-lookup-api-like to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-url-lookup-api-like: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-url-lookup-api-like: already up to date");
} else {
  console.log(`[postinstall] patch-ap-url-lookup-api-like: patched ${patched}/${checked} file(s)`);
}
