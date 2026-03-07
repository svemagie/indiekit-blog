import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/endpoint-files/views/file-form.njk",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-files/views/file-form.njk",
];

const oldCode = "xhr.open('POST', endpoint);";
const newCode = "xhr.open('POST', window.location.pathname);";

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
  console.log("[postinstall] No endpoint-files upload template files found");
} else if (patched === 0) {
  console.log("[postinstall] endpoint-files upload route already patched");
} else {
  console.log(
    `[postinstall] Patched endpoint-files upload route in ${patched} file(s)`,
  );
}
