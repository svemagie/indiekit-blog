/**
 * Patch: rewrite micropub/microsub self-fetch URLs to localhost.
 *
 * Behind a reverse proxy (nginx in a separate FreeBSD jail), Node can't
 * reach its own public HTTPS URL because port 443 only exists on the
 * nginx jail. Rewrites self-referential fetch URLs to use
 * http://localhost:<PORT> instead.
 *
 * Covers: endpoint-syndicate, endpoint-share, endpoint-microsub reader,
 * endpoint-activitypub compose, endpoint-posts utils, and the @rmdes
 * endpoint-posts endpoint.js copy.
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

// Each target defines one or more string replacements in a single file.
// The helper block is inserted after the last import statement.
const targets = [
  // --- endpoint-syndicate ---
  {
    paths: [
      "node_modules/@indiekit/endpoint-syndicate/lib/controllers/syndicate.js",
    ],
    replacements: [
      {
        old: `  const micropubResponse = await fetch(application.micropubEndpoint, {`,
        new: `  const micropubResponse = await fetch(_toInternalUrl(application.micropubEndpoint), {`,
      },
    ],
  },
  // --- endpoint-share ---
  {
    paths: [
      "node_modules/@indiekit/endpoint-share/lib/controllers/share.js",
    ],
    replacements: [
      {
        old: `      const micropubResponse = await fetch(application.micropubEndpoint, {`,
        new: `      const micropubResponse = await fetch(_toInternalUrl(application.micropubEndpoint), {`,
      },
    ],
  },
  // --- microsub reader: URL construction + 2 fetch calls ---
  {
    paths: [
      "node_modules/@rmdes/indiekit-endpoint-microsub/lib/controllers/reader.js",
    ],
    replacements: [
      // getSyndicationTargets: rewrite the built micropubUrl
      {
        old: `    const micropubUrl = micropubEndpoint.startsWith("http")
      ? micropubEndpoint
      : new URL(micropubEndpoint, application.url).href;

    const configUrl = \`\${micropubUrl}?q=config\`;
    const configResponse = await fetch(configUrl, {`,
        new: `    const micropubUrl = _toInternalUrl(micropubEndpoint.startsWith("http")
      ? micropubEndpoint
      : new URL(micropubEndpoint, application.url).href);

    const configUrl = \`\${micropubUrl}?q=config\`;
    const configResponse = await fetch(configUrl, {`,
      },
      // createPost: rewrite the built micropubUrl
      {
        old: `  const micropubUrl = micropubEndpoint.startsWith("http")
    ? micropubEndpoint
    : new URL(micropubEndpoint, application.url).href;`,
        new: `  const micropubUrl = _toInternalUrl(micropubEndpoint.startsWith("http")
    ? micropubEndpoint
    : new URL(micropubEndpoint, application.url).href);`,
      },
    ],
  },
  // --- activitypub compose: URL construction + 2 fetch calls ---
  {
    paths: [
      "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/controllers/compose.js",
    ],
    replacements: [
      // getSyndicationTargets
      {
        old: `    const micropubUrl = micropubEndpoint.startsWith("http")
      ? micropubEndpoint
      : new URL(micropubEndpoint, application.url).href;

    const configUrl = \`\${micropubUrl}?q=config\`;
    const configResponse = await fetch(configUrl, {`,
        new: `    const micropubUrl = _toInternalUrl(micropubEndpoint.startsWith("http")
      ? micropubEndpoint
      : new URL(micropubEndpoint, application.url).href);

    const configUrl = \`\${micropubUrl}?q=config\`;
    const configResponse = await fetch(configUrl, {`,
      },
      // post handler: rewrite the built micropubUrl
      {
        old: `      const micropubUrl = micropubEndpoint.startsWith("http")
        ? micropubEndpoint
        : new URL(micropubEndpoint, application.url).href;`,
        new: `      const micropubUrl = _toInternalUrl(micropubEndpoint.startsWith("http")
        ? micropubEndpoint
        : new URL(micropubEndpoint, application.url).href);`,
      },
    ],
  },
  // --- @rmdes endpoint-posts utils.js: URL built from micropubEndpoint ---
  {
    paths: [
      "node_modules/@rmdes/indiekit-endpoint-posts/lib/utils.js",
    ],
    replacements: [
      {
        old: `  const micropubUrl = new URL(micropubEndpoint);`,
        new: `  const micropubUrl = new URL(_toInternalUrl(micropubEndpoint));`,
      },
    ],
  },
  // --- @rmdes endpoint-posts endpoint.js (separate copy from @indiekit override) ---
  {
    paths: [
      "node_modules/@rmdes/indiekit-endpoint-posts/lib/endpoint.js",
    ],
    replacements: [
      {
        old: `    const endpointResponse = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: \`Bearer \${accessToken}\`,
      },
    });`,
        new: `    const endpointResponse = await fetch(_toInternalUrl(url), {
      headers: {
        accept: "application/json",
        authorization: \`Bearer \${accessToken}\`,
      },
    });`,
      },
      {
        old: `    const endpointResponse = await fetch(url, {
      method: "POST",`,
        new: `    const endpointResponse = await fetch(_toInternalUrl(url), {
      method: "POST",`,
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
  for (const filePath of target.paths) {
    if (!(await exists(filePath))) continue;

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
      console.warn(`[postinstall] micropub-fetch-internal-url: snippet not found in ${filePath} — skipping (${missing.length} missing)`);
      continue;
    }

    // Insert helper block after the last import statement
    const allImportMatches = [...source.matchAll(/^import\s/gm)];
    if (allImportMatches.length === 0) {
      console.warn(`[postinstall] micropub-fetch-internal-url: no imports found in ${filePath} — skipping`);
      continue;
    }

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

    // Apply all replacements
    for (const r of target.replacements) {
      updated = updated.replace(r.old, r.new);
    }

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
