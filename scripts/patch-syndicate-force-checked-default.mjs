/**
 * Patch: when the backend "Syndicate" button is pressed for a post that has
 * no `mp-syndicate-to` and no existing syndication URLs, fall back to targets
 * that have `checked: true` in their options (e.g. ActivityPub) instead of
 * doing nothing.
 *
 * Without this patch, force-syndicating a post that was published without
 * any syndication targets pre-selected would silently no-op.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/endpoint-syndicate/lib/utils.js",
  "node_modules/@rmdes/indiekit-endpoint-syndicate/lib/utils.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-syndicate/lib/utils.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-syndicate/lib/utils.js",
];

const marker = "// syndicate-force-checked-default patch";

const oldSnippet = `    }
    // If no existing syndication URLs, don't default to all — leave empty
  }`;

const newSnippet = `    } else {
      // syndicate-force-checked-default patch
      syndicateTo = syndicationTargets
        .filter((t) => t?.options?.checked)
        .map((t) => t.info.uid);
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
      `[postinstall] Skipping syndicate-force-checked-default patch for ${filePath}: upstream format changed`,
    );
    continue;
  }

  const updated = source.replace(oldSnippet, newSnippet);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-syndicate utils files found");
} else if (patched === 0) {
  console.log("[postinstall] syndicate-force-checked-default patch already applied");
} else {
  console.log(
    `[postinstall] Patched syndicate-force-checked-default in ${patched} file(s)`,
  );
}
