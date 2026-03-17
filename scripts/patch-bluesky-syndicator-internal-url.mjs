/**
 * Patch @rmdes/indiekit-syndicator-bluesky to rewrite own-domain fetch URLs
 * to localhost for jailed setups where the server can't reach its own
 * public HTTPS URL.
 *
 * Affected fetch calls:
 *   - bluesky.js: uploadMedia() fetches photo from getCanonicalUrl(url, me)
 *   - bluesky.js: uploadImageFromUrl() fetches OG images
 *   - utils.js: fetchOpenGraphData() fetches page HTML for OG metadata
 */

import { access, readFile, writeFile } from "node:fs/promises";

const marker = "// [patch] bluesky-syndicator-internal-url";

const helperBlock = `${marker}
const _bskyInternalBase = (() => {
  if (process.env.INTERNAL_FETCH_URL) return process.env.INTERNAL_FETCH_URL.replace(/\\/+$/, "");
  const port = process.env.PORT || "3000";
  return \`http://localhost:\${port}\`;
})();
const _bskyPublicBase = (
  process.env.PUBLICATION_URL || process.env.SITE_URL || ""
).replace(/\\/+$/, "");
function _toInternalUrl(url) {
  if (!_bskyPublicBase || !url.startsWith(_bskyPublicBase)) return url;
  return _bskyInternalBase + url.slice(_bskyPublicBase.length);
}
`;

const targets = [
  // --- bluesky.js: uploadMedia and uploadImageFromUrl ---
  {
    path: "node_modules/@rmdes/indiekit-syndicator-bluesky/lib/bluesky.js",
    replacements: [
      // uploadImageFromUrl: rewrite imageUrl before fetching
      {
        old: `      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; IndiekitBot/1.0)",
        },
        redirect: "follow",
      });`,
        new: `      const response = await fetch(_toInternalUrl(imageUrl), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; IndiekitBot/1.0)",
        },
        redirect: "follow",
      });`,
      },
      // uploadMedia: rewrite mediaUrl before fetching
      {
        old: `      const mediaUrl = getCanonicalUrl(url, me);
      const mediaResponse = await fetch(mediaUrl);`,
        new: `      const mediaUrl = getCanonicalUrl(url, me);
      const mediaResponse = await fetch(_toInternalUrl(mediaUrl));`,
      },
    ],
  },
  // --- utils.js: fetchOpenGraphData ---
  {
    path: "node_modules/@rmdes/indiekit-syndicator-bluesky/lib/utils.js",
    replacements: [
      {
        old: `    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Indiekit/1.0; +https://getindiekit.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });`,
        new: `    const response = await fetch(_toInternalUrl(url), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Indiekit/1.0; +https://getindiekit.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });`,
      },
    ],
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

let totalPatched = 0;

for (const target of targets) {
  const { path: filePath } = target;

  if (!(await exists(filePath))) {
    continue;
  }

  const source = await readFile(filePath, "utf8");

  if (source.includes(marker)) {
    continue;
  }

  // Check that all old snippets exist before patching
  const allFound = target.replacements.every((r) => source.includes(r.old));
  if (!allFound) {
    const missing = target.replacements
      .filter((r) => !source.includes(r.old))
      .map((r) => r.old.slice(0, 60) + "...");
    console.warn(
      `[postinstall] bluesky-syndicator-internal-url: snippet not found in ${filePath} — skipping (${missing.length} missing)`,
    );
    continue;
  }

  // Insert helper block after the last import statement
  const allImportMatches = [...source.matchAll(/^import\s/gm)];
  let insertAt = 0;

  if (allImportMatches.length > 0) {
    const lastImportStart = allImportMatches.at(-1).index;
    const afterLastImport = source.slice(lastImportStart);
    const fromMatch = afterLastImport.match(/from\s+["'][^"']+["']\s*;\s*\n/);
    if (fromMatch) {
      insertAt = lastImportStart + fromMatch.index + fromMatch[0].length;
    }
  }

  const beforeHelper = source.slice(0, insertAt);
  const afterHelper = source.slice(insertAt);

  let updated = beforeHelper + "\n" + helperBlock + "\n" + afterHelper;

  // Apply all replacements
  for (const r of target.replacements) {
    updated = updated.replace(r.old, r.new);
  }

  await writeFile(filePath, updated, "utf8");
  console.log(
    `[postinstall] Patched bluesky-syndicator-internal-url in ${filePath}`,
  );
  totalPatched++;
}

if (totalPatched === 0) {
  console.log(
    "[postinstall] bluesky-syndicator-internal-url patches already applied or no targets found",
  );
} else {
  console.log(
    `[postinstall] bluesky-syndicator-internal-url: patched ${totalPatched} file(s)`,
  );
}
