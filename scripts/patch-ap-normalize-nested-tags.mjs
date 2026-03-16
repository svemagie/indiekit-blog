/**
 * Patch: normalize nested/hierarchical tags before syndicating to the fediverse.
 *
 * Root cause:
 *   Posts use nested tag notation like `on/art/music` or `art/music`. When
 *   these are sent as ActivityPub Hashtag objects, the full path becomes the
 *   hashtag name (e.g. #on/art/music), which is invalid on Mastodon and other
 *   fediverse platforms. Clients display them as broken links or plain text.
 *
 * Fix:
 *   Extract only the last segment of each slash-separated tag before building
 *   the hashtag name. `on/art/music` → `music`, `art/music` → `music`.
 *   The href still links to the full category path on the publication so
 *   internal navigation is unaffected.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
];

const MARKER = "// normalize nested tags fix";

const OLD_PLAIN = `      tags.push({
        type: "Hashtag",
        name: \`#\${cat.replace(/\\s+/g, "")}\`,
        href: \`\${publicationUrl}categories/\${encodeURIComponent(cat)}\`,
      });`;

const NEW_PLAIN = `      tags.push({
        type: "Hashtag",
        name: \`#\${cat.split("/").at(-1).replace(/\\s+/g, "")}\`, // normalize nested tags fix
        href: \`\${publicationUrl}categories/\${encodeURIComponent(cat)}\`,
      });`;

const OLD_FEDIFY = `      tags.push(
        new Hashtag({
          name: \`#\${cat.replace(/\\s+/g, "")}\`,
          href: new URL(
            \`\${publicationUrl}categories/\${encodeURIComponent(cat)}\`,
          ),
        }),
      );`;

const NEW_FEDIFY = `      tags.push(
        new Hashtag({
          name: \`#\${cat.split("/").at(-1).replace(/\\s+/g, "")}\`, // normalize nested tags fix
          href: new URL(
            \`\${publicationUrl}categories/\${encodeURIComponent(cat)}\`,
          ),
        }),
      );`;

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
    continue;
  }

  let updated = source;
  let changed = false;

  if (source.includes(OLD_PLAIN)) {
    updated = updated.replace(OLD_PLAIN, NEW_PLAIN);
    changed = true;
  } else {
    console.log(`[postinstall] patch-ap-normalize-nested-tags: buildPlainTags snippet not found in ${filePath}`);
  }

  if (source.includes(OLD_FEDIFY)) {
    updated = updated.replace(OLD_FEDIFY, NEW_FEDIFY);
    changed = true;
  } else {
    console.log(`[postinstall] patch-ap-normalize-nested-tags: buildFedifyTags snippet not found in ${filePath}`);
  }

  if (!changed || updated === source) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-normalize-nested-tags to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-normalize-nested-tags: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-normalize-nested-tags: already up to date");
} else {
  console.log(`[postinstall] patch-ap-normalize-nested-tags: patched ${patched}/${checked} file(s)`);
}
