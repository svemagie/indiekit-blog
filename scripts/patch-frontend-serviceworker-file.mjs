import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const expected = "node_modules/@indiekit/frontend/lib/serviceworker.js";
const candidates = [
  "node_modules/@rmdes/indiekit-frontend/lib/serviceworker.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/frontend/lib/serviceworker.js",
  "node_modules/@indiekit/endpoint-posts/node_modules/@indiekit/frontend/lib/serviceworker.js",
  "node_modules/@rmdes/indiekit-endpoint-conversations/node_modules/@indiekit/frontend/lib/serviceworker.js",
  "node_modules/@rmdes/indiekit-endpoint-webmention-io/node_modules/@indiekit/frontend/lib/serviceworker.js",
];

const fallback = `const APP_VERSION = "APP_VERSION";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {});
`;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

if (await exists(expected)) {
  console.log("[postinstall] frontend serviceworker already present");
  process.exit(0);
}

let sourcePath = null;
for (const candidate of candidates) {
  if (await exists(candidate)) {
    sourcePath = candidate;
    break;
  }
}

await mkdir(path.dirname(expected), { recursive: true });

if (sourcePath) {
  const content = await readFile(sourcePath, "utf8");
  await writeFile(expected, content, "utf8");
  console.log(`[postinstall] Restored frontend serviceworker from ${sourcePath}`);
} else {
  await writeFile(expected, fallback, "utf8");
  console.log("[postinstall] Created fallback frontend serviceworker");
}
