/**
 * Patch: normalize `properties.syndication` to always be an array before
 * using it in syndicateToTargets().
 *
 * Root cause: Micropub's replaceEntries() stores a single-value array as a
 * plain scalar (JF2 normalization). So after the first successful syndication,
 * `properties.syndication` in the DB is a string like "https://bsky.app/..."
 * rather than ["https://bsky.app/..."]. Spreading a string gives individual
 * characters, so hasSyndicationUrl() never matches and alreadySyndicated is
 * always false — causing posts to be re-syndicated on every webhook trigger.
 *
 * Fix: use [].concat() instead of [...spread] to safely handle both string
 * and array values.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/endpoint-syndicate/lib/utils.js",
  "node_modules/@rmdes/indiekit-endpoint-syndicate/lib/utils.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-syndicate/lib/utils.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-syndicate/lib/utils.js",
];

const marker = "// syndicate-normalize-syndication-array patch";

// Two replacements needed in the same file.
const replacements = [
  {
    old: `  let syndicatedUrls = [...(properties.syndication || [])];`,
    new: `  let syndicatedUrls = [].concat(properties.syndication || []); // syndicate-normalize-syndication-array patch`,
  },
  {
    old: `    const existingSyndication = properties.syndication || [];`,
    new: `    const existingSyndication = [].concat(properties.syndication || []); // syndicate-normalize-syndication-array patch`,
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

let checked = 0;
let patched = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  checked += 1;

  let source = await readFile(filePath, "utf8");

  if (source.includes(marker)) {
    continue;
  }

  let changed = false;
  for (const { old: oldSnippet, new: newSnippet } of replacements) {
    if (!source.includes(oldSnippet)) {
      console.warn(
        `[postinstall] Skipping syndicate-normalize-syndication-array patch for ${filePath}: snippet not found: ${oldSnippet.slice(0, 60)}`,
      );
      continue;
    }
    source = source.replace(oldSnippet, newSnippet);
    changed = true;
  }

  if (changed) {
    await writeFile(filePath, source, "utf8");
    patched += 1;
  }
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-syndicate utils files found");
} else if (patched === 0) {
  console.log("[postinstall] syndicate-normalize-syndication-array patch already applied");
} else {
  console.log(
    `[postinstall] Patched syndicate-normalize-syndication-array in ${patched} file(s)`,
  );
}
