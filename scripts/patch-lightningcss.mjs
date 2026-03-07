import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/frontend/lib/lightningcss.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/frontend/lib/lightningcss.js",
  "node_modules/@indiekit/endpoint-posts/node_modules/@indiekit/frontend/lib/lightningcss.js",
  "node_modules/@rmdes/indiekit-endpoint-conversations/node_modules/@indiekit/frontend/lib/lightningcss.js",
  "node_modules/@rmdes/indiekit-endpoint-webmention-io/node_modules/@indiekit/frontend/lib/lightningcss.js",
];

const replacement = `function resolveModuleFilePath(filePath) {
  const modulePathMatch = filePath.match(/(?:^|[\\\\/])~([^\\\\/].*)$/);

  if (modulePathMatch?.[1]) {
    const moduleFilePath = modulePathMatch[1];
    return require.resolve(moduleFilePath);
  }

  return filePath;
}`;

const functionRegex =
  /function resolveModuleFilePath\(filePath\) \{[\s\S]*?\n\}/m;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

let patched = 0;
let checked = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  checked += 1;

  const source = await readFile(filePath, "utf8");

  if (source.includes("modulePathMatch = filePath.match")) {
    continue;
  }

  if (!functionRegex.test(source)) {
    continue;
  }

  const updated = source.replace(functionRegex, replacement);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No @indiekit/frontend lightningcss files found");
} else if (patched === 0) {
  console.log("[postinstall] lightningcss resolver already patched");
} else {
  console.log(`[postinstall] Patched lightningcss resolver in ${patched} file(s)`);
}
