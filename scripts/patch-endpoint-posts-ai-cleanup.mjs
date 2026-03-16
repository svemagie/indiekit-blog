import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-posts/lib/controllers/form.js",
  "node_modules/@indiekit/endpoint-posts/lib/controllers/form.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-posts/lib/controllers/form.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-posts/lib/controllers/form.js",
];

const marker = "Always remove legacy hyphenated keys — superseded by camelCase equivalents.";

const oldSnippet = [
  "      // Easy MDE appends `image` value to formData for last image uploaded",
  "      delete values.image;",
  "",
  "      // Remove empty AI metadata fields so Micropub payload stays lean.",
  "      for (const key of [",
  "        \"aiTextLevel\",",
  "        \"aiCodeLevel\",",
  "        \"aiTools\",",
  "        \"aiDescription\",",
  "        \"ai-text-level\",",
  "        \"ai-code-level\",",
  "        \"ai-tools\",",
  "        \"ai-description\",",
  "      ]) {",
  "        if (",
  "          values[key] === undefined ||",
  "          values[key] === null ||",
  "          String(values[key]).trim() === \"\"",
  "        ) {",
  "          delete values[key];",
  "        }",
  "      }",
  "",
  "      const mf2 = jf2ToMf2({ properties: sanitise(values) });",
].join("\n");

const newSnippet = [
  "      // Easy MDE appends `image` value to formData for last image uploaded",
  "      delete values.image;",
  "",
  "      // Remove empty AI metadata fields so Micropub payload stays lean.",
  "      for (const key of [",
  "        \"aiTextLevel\",",
  "        \"aiCodeLevel\",",
  "        \"aiTools\",",
  "        \"aiDescription\",",
  "      ]) {",
  "        if (",
  "          values[key] === undefined ||",
  "          values[key] === null ||",
  "          String(values[key]).trim() === \"\"",
  "        ) {",
  "          delete values[key];",
  "        }",
  "      }",
  "      // Always remove legacy hyphenated keys — superseded by camelCase equivalents.",
  "      delete values[\"ai-text-level\"];",
  "      delete values[\"ai-code-level\"];",
  "      delete values[\"ai-tools\"];",
  "      delete values[\"ai-description\"];",
  "",
  "      const mf2 = jf2ToMf2({ properties: sanitise(values) });",
].join("\n");

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
    // Already has AI field cleanup in some form — skip silently
    if (
      source.includes('"ai-text-level"') ||
      source.includes('"aiTextLevel"') ||
      !source.includes("jf2ToMf2")
    ) {
      continue;
    }
    console.warn(
      `[postinstall] Skipping endpoint-posts AI cleanup patch for ${filePath}: upstream format changed`,
    );
    continue;
  }

  const updated = source.replace(oldSnippet, newSnippet);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-posts form controller files found");
} else if (patched === 0) {
  console.log("[postinstall] endpoint-posts AI cleanup patch already applied");
} else {
  console.log(
    `[postinstall] Patched endpoint-posts AI cleanup in ${patched} file(s)`,
  );
}
