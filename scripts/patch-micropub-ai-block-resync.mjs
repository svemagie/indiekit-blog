/**
 * Patch @indiekit/endpoint-micropub/lib/post-data.js to detect stale AI block files.
 *
 * Problem: The v3 patch bug (supportsAiDisclosure always false) caused Indiekit to update
 * MongoDB with AI field values (aiTextLevel, aiCodeLevel, etc.) but write the post file
 * WITHOUT the ai: frontmatter block. Now when the user re-saves with the same AI values,
 * Indiekit's isDeepStrictEqual check says "no properties changed" and skips the file write.
 * The file remains stale (missing ai: block) even though MongoDB has the right data.
 *
 * Fix: Store an `_aiBlockVersion` field in MongoDB alongside each post. On update, if the
 * stored version doesn't match the current patch version AND the post has AI fields, bypass
 * the no-change check and force a file re-write. This triggers exactly once per affected
 * post, then every subsequent no-change save correctly skips the write.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const AI_BLOCK_VERSION = "v4";

const candidates = [
  "node_modules/@indiekit/endpoint-micropub/lib/post-data.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-micropub/lib/post-data.js",
];

const marker = "AI block version resync patch";

// --- Old: simple destructuring that ignores _aiBlockVersion ---
const oldDestructure = `let { path: _originalPath, properties } = await this.read(application, url);`;

const newDestructure = `let { path: _originalPath, properties, _aiBlockVersion: storedAiBlockVersion } = await this.read(application, url); // AI block version resync patch`;

// --- Old: early return when no properties changed ---
const oldNoChange = `    // Return if no changes to template properties detected
    const newProperties = getPostTemplateProperties(properties);
    oldProperties = getPostTemplateProperties(oldProperties);
    if (isDeepStrictEqual(newProperties, oldProperties)) {
      return;
    }`;

const newNoChange = `    // Return if no changes to template properties detected
    const newProperties = getPostTemplateProperties(properties);
    oldProperties = getPostTemplateProperties(oldProperties);
    if (isDeepStrictEqual(newProperties, oldProperties)) {
      // AI block version resync patch: if post has AI fields and the file was written by an
      // older patch version (or never written with the ai: block), force a one-time re-write.
      const hasAiFields =
        newProperties.aiTextLevel !== undefined ||
        newProperties.aiCodeLevel !== undefined;
      const currentAiBlockVersion = "${AI_BLOCK_VERSION}";
      if (!hasAiFields || storedAiBlockVersion === currentAiBlockVersion) {
        return;
      }
      // Fall through: force re-write to fix stale ai: block
    }`;

// --- Old: postData construction without _aiBlockVersion ---
const oldPostData = `    // Update data in posts collection
    const postData = { _originalPath, path, properties };`;

const newPostData = `    // Update data in posts collection
    const postData = { _originalPath, path, properties, _aiBlockVersion: "${AI_BLOCK_VERSION}" }; // AI block version resync patch`;

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

  if (
    !source.includes(oldDestructure) ||
    !source.includes(oldNoChange) ||
    !source.includes(oldPostData)
  ) {
    console.warn(
      `[postinstall] Skipping micropub AI block resync patch for ${filePath}: upstream format changed`,
    );
    continue;
  }

  const updated = source
    .replace(oldDestructure, newDestructure)
    .replace(oldNoChange, newNoChange)
    .replace(oldPostData, newPostData);

  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-micropub post-data.js found");
} else if (patched === 0) {
  console.log("[postinstall] micropub AI block resync patch already applied");
} else {
  console.log(
    `[postinstall] Patched micropub AI block resync in ${patched} file(s)`,
  );
}
