/**
 * Patch: pre-fill reference URL when creating posts from /news "Post" button.
 *
 * share-post.js opens /posts/create?type=like&url=<link>&name=<title>
 * but postData.create only reads request.body for properties, ignoring query params.
 *
 * Fix: in postData.create, when properties is empty and request.query.url is present,
 * seed properties with the correct field name for that post type:
 *   like     → like-of
 *   bookmark → bookmark-of
 *   reply    → in-reply-to
 *   repost   → repost-of
 * and optionally seed name/bookmark title from request.query.name.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "posts-prefill-url-from-query",
    marker: "prefill reference URL from query param",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-posts/lib/middleware/post-data.js",
      "node_modules/@indiekit/endpoint-posts/lib/middleware/post-data.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-posts/lib/middleware/post-data.js",
    ],
    oldSnippet: `    const postType = request.query.type || "note";
    const properties = request.body || {};`,
    newSnippet: `    const postType = request.query.type || "note";
    // prefill reference URL from query param when opening from share-post button
    let properties = request.body || {};
    if (Object.entries(properties).length === 0 && request.query.url) {
      const refUrl = request.query.url;
      const refName = request.query.name || "";
      const urlFieldByType = {
        like: "like-of",
        bookmark: "bookmark-of",
        reply: "in-reply-to",
        repost: "repost-of",
      };
      const urlField = urlFieldByType[postType];
      if (urlField) {
        properties = { [urlField]: refUrl };
        if (postType === "bookmark" && refName) {
          properties.name = refName;
        }
      }
    }`,
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

let filesChecked = 0;
let filesPatched = 0;

for (const spec of patchSpecs) {
  let foundAnyTarget = false;

  for (const filePath of spec.candidates) {
    if (!(await exists(filePath))) continue;

    foundAnyTarget = true;
    filesChecked += 1;

    const source = await readFile(filePath, "utf8");

    if (source.includes(spec.marker)) continue;
    if (!source.includes(spec.oldSnippet)) {
      console.log(`[postinstall] ${spec.name}: snippet not found in ${filePath}`);
      continue;
    }

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);
    await writeFile(filePath, updated, "utf8");
    filesPatched += 1;
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (filesChecked === 0) {
  console.log("[postinstall] No posts endpoint post-data.js found");
} else if (filesPatched === 0) {
  console.log("[postinstall] posts prefill-url already patched");
} else {
  console.log(
    `[postinstall] Patched posts prefill-url in ${filesPatched}/${filesChecked} file(s)`,
  );
}
