import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-setup.js",
];

const oldSnippet = `      loggers: [
        {
          // All Fedify logs — federation, vocab, delivery, HTTP signatures
          category: ["fedify"],
          sinks: ["console"],
          lowestLevel: resolvedLevel,
        },
      ],`;

const newSnippet = `      loggers: [
        {
          // Noise guard: remote deleted actors often return 404/410 on fetch.
          // Keep only fatal events for the docloader category.
          category: ["fedify", "runtime", "docloader"],
          sinks: ["console"],
          lowestLevel: "fatal",
        },
        {
          // All remaining Fedify logs - federation, vocab, delivery, signatures.
          category: ["fedify"],
          sinks: ["console"],
          lowestLevel: resolvedLevel,
        },
      ],`;

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

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  filesChecked += 1;

  const source = await readFile(filePath, "utf8");

  if (source.includes(newSnippet)) {
    continue;
  }

  if (!source.includes(oldSnippet)) {
    continue;
  }

  const updated = source.replace(oldSnippet, newSnippet);

  if (updated === source) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  filesPatched += 1;
}

if (filesChecked === 0) {
  console.log("[postinstall] No activitypub federation setup files found");
} else if (filesPatched === 0) {
  console.log("[postinstall] activitypub docloader loglevel patch already applied");
} else {
  console.log(
    `[postinstall] Patched activitypub docloader loglevel in ${filesPatched}/${filesChecked} file(s)`,
  );
}