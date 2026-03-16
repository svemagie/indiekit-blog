/**
 * Patch: rewrite micropub self-fetch URLs to localhost in endpoint-syndicate
 * and endpoint-share.
 *
 * Same issue as endpoint-posts: behind a reverse proxy (nginx in a separate
 * FreeBSD jail), Node can't reach its own public HTTPS URL because port 443
 * only exists on the nginx jail.
 *
 * Rewrites fetch(application.micropubEndpoint, ...) to use
 * http://localhost:<PORT> instead.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const marker = "// [patch] micropub-fetch-internal-url";

const helperBlock = `${marker}
const _mpInternalBase = (() => {
  if (process.env.INTERNAL_FETCH_URL) return process.env.INTERNAL_FETCH_URL.replace(/\\/+$/, "");
  const port = process.env.PORT || "3000";
  return \`http://localhost:\${port}\`;
})();
const _mpPublicBase = (
  process.env.PUBLICATION_URL || process.env.SITE_URL || ""
).replace(/\\/+$/, "");
function _toInternalUrl(url) {
  if (!_mpPublicBase || !url.startsWith(_mpPublicBase)) return url;
  return _mpInternalBase + url.slice(_mpPublicBase.length);
}
`;

const targets = [
  {
    paths: [
      "node_modules/@indiekit/endpoint-syndicate/lib/controllers/syndicate.js",
    ],
    oldSnippet: `  const micropubResponse = await fetch(application.micropubEndpoint, {`,
    newSnippet: `  const micropubResponse = await fetch(_toInternalUrl(application.micropubEndpoint), {`,
  },
  {
    paths: [
      "node_modules/@indiekit/endpoint-share/lib/controllers/share.js",
    ],
    oldSnippet: `      const micropubResponse = await fetch(application.micropubEndpoint, {`,
    newSnippet: `      const micropubResponse = await fetch(_toInternalUrl(application.micropubEndpoint), {`,
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
  for (const filePath of target.paths) {
    if (!(await exists(filePath))) continue;

    const source = await readFile(filePath, "utf8");

    if (source.includes(marker)) {
      continue;
    }

    if (!source.includes(target.oldSnippet)) {
      console.warn(`[postinstall] micropub-fetch-internal-url: snippet not found in ${filePath} — skipping`);
      continue;
    }

    // Insert helper block after the last import statement.
    // Find the last "from" keyword followed by a string and semicolon,
    // which marks the end of the last import.
    const importEndPattern = /;\s*\n/g;
    const allImportMatches = [...source.matchAll(/^import\s/gm)];
    if (allImportMatches.length === 0) {
      console.warn(`[postinstall] micropub-fetch-internal-url: no imports found in ${filePath} — skipping`);
      continue;
    }

    // Find the semicolon+newline that ends the last import block
    const lastImportStart = allImportMatches.at(-1).index;
    const afterLastImport = source.slice(lastImportStart);
    const fromMatch = afterLastImport.match(/from\s+["'][^"']+["']\s*;\s*\n/);
    if (!fromMatch) {
      console.warn(`[postinstall] micropub-fetch-internal-url: can't find end of last import in ${filePath} — skipping`);
      continue;
    }

    const insertAt = lastImportStart + fromMatch.index + fromMatch[0].length;
    const beforeHelper = source.slice(0, insertAt);
    const afterHelper = source.slice(insertAt);

    let updated = beforeHelper + "\n" + helperBlock + "\n" + afterHelper;

    // Now replace the fetch call
    updated = updated.replace(target.oldSnippet, target.newSnippet);

    await writeFile(filePath, updated, "utf8");
    console.log(`[postinstall] Patched micropub-fetch-internal-url in ${filePath}`);
    totalPatched++;
  }
}

if (totalPatched === 0) {
  console.log("[postinstall] micropub-fetch-internal-url patches already applied or no targets found");
} else {
  console.log(`[postinstall] micropub-fetch-internal-url: patched ${totalPatched} file(s)`);
}
