import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "activitypub-migrate-alias-clear",
    marker: "allow clearing alsoKnownAs alias by submitting empty value",
    oldSnippet: `      const aliasUrl = request.body.aliasUrl?.trim();
      if (aliasUrl && profileCollection) {
        await profileCollection.updateOne(
          {},
          { $set: { alsoKnownAs: [aliasUrl] } },
          { upsert: true },
        );
        result = {
          type: "success",
          text: response.locals.__("activitypub.migrate.aliasSuccess"),
        };
      }`,
    newSnippet: `      const aliasUrl = request.body.aliasUrl?.trim();
      const submittedAliasField = Object.prototype.hasOwnProperty.call(
        request.body || {},
        "aliasUrl",
      );

      // allow clearing alsoKnownAs alias by submitting empty value
      if (profileCollection && submittedAliasField) {
        if (aliasUrl) {
          await profileCollection.updateOne(
            {},
            { $set: { alsoKnownAs: [aliasUrl] } },
            { upsert: true },
          );
          result = {
            type: "success",
            text: response.locals.__("activitypub.migrate.aliasSuccess"),
          };
        } else {
          await profileCollection.updateOne(
            {},
            { $set: { alsoKnownAs: [] } },
            { upsert: true },
          );
          result = {
            type: "success",
            text: "Alias removed - alsoKnownAs is now empty.",
          };
        }
      }`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/controllers/migrate.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/controllers/migrate.js",
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

let filesChecked = 0;
let filesPatched = 0;

for (const spec of patchSpecs) {
  let foundAnyTarget = false;

  for (const filePath of spec.candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    filesChecked += 1;

    const source = await readFile(filePath, "utf8");

    if (source.includes(spec.marker)) {
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
      continue;
    }

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);
    await writeFile(filePath, updated, "utf8");
    filesPatched += 1;
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (filesChecked === 0) {
  console.log("[postinstall] No activitypub migrate alias files found");
} else if (filesPatched === 0) {
  console.log("[postinstall] activitypub migrate alias clear already patched");
} else {
  console.log(
    `[postinstall] Patched activitypub migrate alias clear in ${filesPatched}/${filesChecked} file(s)`,
  );
}
