/**
 * Patch: make the Fedify object dispatcher's post lookup tolerate trailing-slash
 * differences between the AP object URL and the stored post URL.
 *
 * Root cause:
 *   setupObjectDispatchers resolvePost() builds postUrl from the {+id} template
 *   variable (e.g. "replies/bd78a") and does an exact findOne() match against
 *   posts.properties.url.  Posts in MongoDB are stored with a trailing slash
 *   ("https://blog.giersig.eu/replies/bd78a/"), but the AP object URL returned
 *   by the /api/ap-url lookup endpoint has no trailing slash.  The exact match
 *   fails → Fedify returns 404 → remote instance shows "Could not connect".
 *
 * Fix:
 *   Replace the single-value findOne() with a $in query that tries both the
 *   bare URL and the URL with a trailing slash appended.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
];

const MARKER = "// trailing-slash url fix";

const OLD_SNIPPET = `    const postUrl = \`\${publicationUrl.replace(/\\/$/, "")}/\${id}\`;
    const post = await collections.posts.findOne({ "properties.url": postUrl });`;

const NEW_SNIPPET = `    const postUrl = \`\${publicationUrl.replace(/\\/$/, "")}/\${id}\`; // trailing-slash url fix
    const post = await collections.posts.findOne({
      "properties.url": { $in: [postUrl, postUrl + "/"] },
    });`;

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

  if (source.includes(MARKER)) {
    continue;
  }

  if (!source.includes(OLD_SNIPPET)) {
    console.log(`[postinstall] patch-ap-object-url-trailing-slash: snippet not found in ${filePath}`);
    continue;
  }

  const updated = source.replace(OLD_SNIPPET, NEW_SNIPPET);

  if (updated === source) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-object-url-trailing-slash to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-object-url-trailing-slash: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-object-url-trailing-slash: already up to date");
} else {
  console.log(`[postinstall] patch-ap-object-url-trailing-slash: patched ${patched}/${checked} file(s)`);
}
