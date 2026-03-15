/**
 * Patch: add `category` and `search` filtering to the Micropub `?q=source`
 * list endpoint so that /posts can filter by tag and full-text search.
 *
 * When `category` is provided:
 *   filter MongoDB documents where `properties.category` matches the value.
 * When `search` is provided:
 *   filter by a case-insensitive regex across name / content fields.
 *
 * Filtered queries bypass getCursor (no cursor-based pagination needed for
 * small result sets) and return all matching posts up to the current limit.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-micropub/lib/controllers/query.js",
  "node_modules/@indiekit/endpoint-micropub/lib/controllers/query.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-micropub/lib/controllers/query.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-micropub/lib/controllers/query.js",
];

const marker = "// filter-by-category-and-search patch";

const oldSnippet = `        } else {
          // Return mf2 for published posts
          let cursor = {
            items: [],
            hasNext: false,
            hasPrev: false,
          };

          if (postsCollection) {
            cursor = await getCursor(postsCollection, after, before, limit);
          }`;

const newSnippet = `        } else {
          // Return mf2 for published posts
          // filter-by-category-and-search patch
          const categoryParam = request.query.category;
          const searchParam = request.query.search;
          const hasExtraFilter = Boolean(categoryParam || searchParam);

          let cursor = {
            items: [],
            hasNext: false,
            hasPrev: false,
          };

          if (postsCollection) {
            if (hasExtraFilter) {
              const filterQuery = {};
              if (categoryParam) {
                filterQuery["properties.category"] = String(categoryParam);
              }
              if (searchParam) {
                const re = String(searchParam).replace(
                  /[$()*+.?[\\\]^{|}]/g,
                  "\\$&",
                );
                filterQuery.$or = [
                  { "properties.name": { $regex: re, $options: "i" } },
                  {
                    "properties.content.text": {
                      $regex: re,
                      $options: "i",
                    },
                  },
                  { "properties.content": { $regex: re, $options: "i" } },
                ];
              }
              const findLimit = (limit && limit > 0) ? limit : 40;
              const filteredItems = await postsCollection
                .find(filterQuery, { limit: findLimit, sort: { _id: -1 } })
                .toArray();
              cursor = {
                items: filteredItems,
                hasNext: false,
                hasPrev: false,
              };
            } else {
              cursor = await getCursor(postsCollection, after, before, limit);
            }
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

  if (source.includes(marker)) {
    continue;
  }

  if (!source.includes(oldSnippet)) {
    console.warn(
      `[postinstall] Skipping micropub source-filter patch for ${filePath}: upstream format changed`,
    );
    continue;
  }

  const updated = source.replace(oldSnippet, newSnippet);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No micropub query controller files found");
} else if (patched === 0) {
  console.log("[postinstall] micropub source-filter patch already applied");
} else {
  console.log(
    `[postinstall] Patched micropub source-filter in ${patched} file(s)`,
  );
}
