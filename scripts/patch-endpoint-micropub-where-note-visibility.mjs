import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/endpoint-micropub/lib/post-data.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-micropub/lib/post-data.js",
];

const marker = 'properties.visibility = "unlisted";';

const oldCode = `    // Post type
    const type = getPostType(postTypes, properties);
    properties["post-type"] = type;

    // Get post type configuration`;

const newCode = `    // Post type
    const type = getPostType(postTypes, properties);
    properties["post-type"] = type;

    // Force OwnYourSwarm /where check-in notes to unlisted so they are
    // hidden from the blog, syndication targets, and ActivityPub federation.
    // OwnYourSwarm may send visibility:"private" which Indiekit does not
    // recognise, so we always override to "unlisted" for these posts.
    const hasCheckinProperty = Object.prototype.hasOwnProperty.call(properties, "checkin");
    const syndicationValues = Array.isArray(properties.syndication)
      ? properties.syndication
      : properties.syndication
        ? [properties.syndication]
        : [];
    const hasSwarmSyndication = syndicationValues.some((value) =>
      String(value).includes("swarmapp.com"),
    );

    if (
      type === "note" &&
      (hasCheckinProperty || hasSwarmSyndication)
    ) {
      properties.visibility = "unlisted";
    }

    // Get post type configuration`;

async function exists(path) {
  try {
    await access(path);
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

  if (!source.includes(oldCode)) {
    continue;
  }

  const updated = source.replace(oldCode, newCode);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-micropub post-data files found");
} else if (patched === 0) {
  console.log("[postinstall] endpoint-micropub where-note visibility already patched");
} else {
  console.log(
    `[postinstall] Patched endpoint-micropub where-note visibility in ${patched} file(s)`,
  );
}
