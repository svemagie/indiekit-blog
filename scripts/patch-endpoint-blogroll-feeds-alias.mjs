/**
 * Patch: add /api/feeds alias for /api/blogs in the blogroll endpoint.
 *
 * The /news/ static page fetches /rssapi/api/feeds to populate the feed-source
 * filter dropdown. The blogroll endpoint exposes the same data under /api/blogs.
 * This patch inserts a /api/feeds route that delegates to the same controller.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "blogroll-feeds-alias",
    marker: "feeds alias for /api/blogs",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-blogroll/index.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-blogroll/index.js",
    ],
    oldSnippet: `    publicRouter.get("/api/blogs", apiController.listBlogs);`,
    newSnippet: `    publicRouter.get("/api/blogs", apiController.listBlogs);
    // feeds alias for /api/blogs (used by the /news/ static page)
    publicRouter.get("/api/feeds", apiController.listBlogs);`,
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
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    filesChecked += 1;

    const source = await readFile(filePath, "utf8");

    if (source.includes(spec.marker)) {
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
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
  console.log("[postinstall] No blogroll endpoint files found");
} else if (filesPatched === 0) {
  console.log("[postinstall] blogroll feeds alias already patched");
} else {
  console.log(
    `[postinstall] Patched blogroll feeds alias in ${filesPatched}/${filesChecked} file(s)`,
  );
}
