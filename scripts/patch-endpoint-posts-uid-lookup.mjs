/**
 * Patch: fix post editing 404 by adding uid-based lookup to micropub source query.
 *
 * Root cause: getPostProperties queries ?q=source (no URL/uid filter) and scans
 * through at most 40 posts looking for item.uid === uid. Posts older than the
 * 40 most recent are never found, returning 404.
 *
 * Fix:
 *   1. Patch micropub query controller to handle ?q=source&uid=<objectId>
 *      by doing a direct findOne({ _id: objectId }) and returning { items: [mf2] }.
 *   2. Patch getPostProperties to append uid to the micropub query URL.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "micropub-source-uid-lookup",
    marker: "uid-based source lookup",
    candidates: [
      "node_modules/@indiekit/endpoint-micropub/lib/controllers/query.js",
      "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-micropub/lib/controllers/query.js",
    ],
    oldSnippet: `      case "source": {
        if (url) {`,
    newSnippet: `      case "source": {
        const { uid: uidParam } = request.query;
        if (uidParam) {
          // uid-based source lookup: find post directly by MongoDB _id
          let postData;
          if (postsCollection) {
            try {
              const { getObjectId } = await import("@indiekit/util");
              postData = await postsCollection.findOne({ _id: getObjectId(uidParam) });
            } catch {}
          }
          if (!postData) {
            throw IndiekitError.badRequest(
              response.locals.__("BadRequestError.missingResource", "post"),
            );
          }
          const mf2 = jf2ToMf2(postData);
          response.json({ items: [mf2] });
          break;
        }
        if (url) {`,
  },
  {
    name: "posts-utils-uid-query",
    marker: "uid-based micropub source query",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-posts/lib/utils.js",
      "node_modules/@indiekit/endpoint-posts/lib/utils.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-posts/lib/utils.js",
    ],
    oldSnippet: `  const micropubUrl = new URL(micropubEndpoint);
  micropubUrl.searchParams.append("q", "source");

  const micropubResponse = await endpoint.get(micropubUrl.href, accessToken);`,
    newSnippet: `  const micropubUrl = new URL(micropubEndpoint);
  micropubUrl.searchParams.append("q", "source");
  // uid-based micropub source query: fetch specific post by MongoDB _id
  micropubUrl.searchParams.append("uid", uid);

  const micropubResponse = await endpoint.get(micropubUrl.href, accessToken);`,
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
      // Beta.41+ uses direct MongoDB queries — uid lookup is native, skip silently
      if (source.includes("getPostProperties") || source.includes("getPosts")) {
        continue;
      }
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
  console.log("[postinstall] No posts/micropub endpoint files found");
} else if (filesPatched === 0) {
  console.log("[postinstall] posts uid-lookup already patched");
} else {
  console.log(
    `[postinstall] Patched posts uid-lookup in ${filesPatched}/${filesChecked} file(s)`,
  );
}
