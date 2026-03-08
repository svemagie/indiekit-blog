import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/endpoint-media/lib/media-transform.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-media/lib/media-transform.js",
];

const oldImport = 'import sharp from "sharp";';
const newImport = [
  'import { createRequire } from "node:module";',
  "",
  "const require = createRequire(import.meta.url);",
  "",
  "let sharpModule;",
  "let sharpLoadError;",
  "",
  "const getSharp = () => {",
  "  if (sharpModule) {",
  "    return sharpModule;",
  "  }",
  "",
  "  if (sharpLoadError) {",
  "    return null;",
  "  }",
  "",
  "  try {",
  '    sharpModule = require("sharp");',
  "    return sharpModule;",
  "  } catch (error) {",
  "    sharpLoadError = error;",
  "    console.warn(",
  '      "[postinstall] endpoint-media sharp unavailable (" +',
  "        (error.code || error.message) +",
  '        "); image transform disabled",',
  "    );",
  "    return null;",
  "  }",
  "};",
].join("\n");

const oldTransformBlock = `  const { resize } = imageProcessing;

  file.data = await sharp(file.data).rotate().resize(resize).toBuffer();`;

const newTransformBlock = `  const sharp = getSharp();
  if (!sharp) {
    return file;
  }

  const resize = imageProcessing?.resize;
  let pipeline = sharp(file.data).rotate();

  if (resize) {
    pipeline = pipeline.resize(resize);
  }

  file.data = await pipeline.toBuffer();`;

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

  if (source.includes("const getSharp = () =>")) {
    continue;
  }

  let updated = source;
  let changed = false;

  if (updated.includes(oldImport)) {
    updated = updated.replace(oldImport, newImport);
    changed = true;
  }

  if (updated.includes(oldTransformBlock)) {
    updated = updated.replace(oldTransformBlock, newTransformBlock);
    changed = true;
  }

  if (!changed) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-media transform files found");
} else if (patched === 0) {
  console.log("[postinstall] endpoint-media sharp runtime patch already applied");
} else {
  console.log(
    `[postinstall] Patched endpoint-media sharp runtime handling in ${patched} file(s)`,
  );
}
