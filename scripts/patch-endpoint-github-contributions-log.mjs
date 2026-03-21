import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-github/lib/controllers/contributions.js",
];

// Marker: present once the patch has already been applied
const marker = "// [patched] suppress contributions fallback log";

const oldLog1 = `        console.log("[contributions] Events API returned no contributions, using Search API");`;
const newLog1 = `        // [patched] suppress contributions fallback log`;

const oldLog2 = `        console.log("[contributions API] Events API returned no contributions, using Search API");`;
const newLog2 = `        // [patched] suppress contributions fallback log`;

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
    console.log("[postinstall] endpoint-github contributions log already suppressed");
    continue;
  }

  if (!source.includes(oldLog1) && !source.includes(oldLog2)) {
    console.log("[postinstall] endpoint-github contributions: unexpected source layout, skipping");
    continue;
  }

  const updated = source
    .replace(oldLog1, newLog1)
    .replace(oldLog2, newLog2);

  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-github contributions file found");
} else if (patched > 0) {
  console.log(
    `[postinstall] Suppressed contributions fallback log in ${patched} file(s)`,
  );
}
