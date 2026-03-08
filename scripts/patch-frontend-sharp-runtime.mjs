import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/frontend/lib/sharp.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/frontend/lib/sharp.js",
  "node_modules/@indiekit/endpoint-posts/node_modules/@indiekit/frontend/lib/sharp.js",
  "node_modules/@rmdes/indiekit-endpoint-conversations/node_modules/@indiekit/frontend/lib/sharp.js",
  "node_modules/@rmdes/indiekit-endpoint-webmention-io/node_modules/@indiekit/frontend/lib/sharp.js",
];

const marker = "const getSharp = () =>";

const replacement = `import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { icon } from "./globals/icon.js";

const require = createRequire(import.meta.url);
const fallbackPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tm4cAAAAASUVORK5CYII=",
  "base64",
);

let sharpModule;
let sharpLoadError;

const getSharp = () => {
  if (sharpModule) {
    return sharpModule;
  }

  if (sharpLoadError) {
    return null;
  }

  try {
    sharpModule = require("sharp");
    return sharpModule;
  } catch (error) {
    sharpLoadError = error;
    console.warn(
      "[postinstall] frontend sharp unavailable (" +
        (error.code || error.message) +
        "); app icon generation disabled",
    );
    return null;
  }
};

/**
 * Get application icon image
 * @param {string|number} size - Icon size
 * @param {string} themeColor - Theme colour
 * @param {string} [purpose] - Icon purpose (any, maskable or monochrome)
 * @returns {Promise<Buffer>} File buffer
 */
export const appIcon = async (size, themeColor, purpose = "any") => {
  const sharp = getSharp();
  if (!sharp) {
    return fallbackPng;
  }

  const svgPath = fileURLToPath(
    new URL("../assets/app-icon-" + purpose + ".svg", import.meta.url),
  );

  const svg = fs.readFileSync(svgPath);
  return sharp(svg)
    .tint(themeColor)
    .resize(Number(size))
    .png({ colours: 16 })
    .toBuffer();
};

/**
 * Get shortcut icon image
 * @param {string|number} size - Icon size
 * @param {string} name - Icon name
 * @returns {Promise<Buffer>} PNG file
 */
export const shortcutIcon = async (size, name) => {
  const sharp = getSharp();
  if (!sharp) {
    return fallbackPng;
  }

  return sharp(Buffer.from(icon(name)))
    .resize(Number(size))
    .png({ colours: 16 })
    .toBuffer();
};
`;

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

  if (!source.includes('import sharp from "sharp";')) {
    continue;
  }

  await writeFile(filePath, replacement, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No frontend sharp files found");
} else if (patched === 0) {
  console.log("[postinstall] frontend sharp runtime patch already applied");
} else {
  console.log(`[postinstall] Patched frontend sharp runtime handling in ${patched} file(s)`);
}
