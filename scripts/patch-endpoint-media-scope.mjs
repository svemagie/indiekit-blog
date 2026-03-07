import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/endpoint-media/lib/scope.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-media/lib/scope.js",
];

const oldCode = 'if (scope === "create" && action === "media") {';
const newCode = 'if (scope.includes("create") && action === "media") {';

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

  if (source.includes(newCode)) {
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
  console.log("[postinstall] No endpoint-media scope files found");
} else if (patched === 0) {
  console.log("[postinstall] endpoint-media scope already patched");
} else {
  console.log(`[postinstall] Patched endpoint-media scope in ${patched} file(s)`);
}
