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

const authBypassMarker = "Never cache auth/session pages";
const oldFetchCacheLine = "  const retrieveFromCache = caches.match(request);";
const newFetchCacheBlock = `  const requestUrl = new URL(request.url);

  // Never cache auth/session pages; always go to network.
  if (
    requestUrl.origin === self.location.origin &&
    /^\\/(auth|session)(?:\\/|$)/.test(requestUrl.pathname)
  ) {
    event.respondWith(fetch(request));
    return;
  }

  const retrieveFromCache = caches.match(request);`;

const clearAuthSessionEntriesFn = `
async function clearAuthSessionEntries() {
  try {
    const pagesCache = await caches.open(pagesCacheName);
    const keys = await pagesCache.keys();

    await Promise.all(
      keys
        .filter((request) => {
          const requestUrl = new URL(request.url);
          return (
            requestUrl.origin === self.location.origin &&
            /^\\/(auth|session)(?:\\/|$)/.test(requestUrl.pathname)
          );
        })
        .map((request) => pagesCache.delete(request)),
    );
  } catch (error) {
    console.error("Error clearing auth/session cache entries", error);
  }
}
`;

const activateOld = `      await clearOldCaches();
      await clients.claim();`;

const activateNew = `      await clearOldCaches();
      await clearAuthSessionEntries();
      await clients.claim();`;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function patchServiceworker(content) {
  let updated = content;

  if (!updated.includes(authBypassMarker) && updated.includes(oldFetchCacheLine)) {
    updated = updated.replace(oldFetchCacheLine, newFetchCacheBlock);
  }

  if (
    !updated.includes("async function clearAuthSessionEntries()") &&
    updated.includes("async function trimCache(cacheName, maxItems)")
  ) {
    updated = updated.replace(
      "async function trimCache(cacheName, maxItems)",
      `${clearAuthSessionEntriesFn}\nasync function trimCache(cacheName, maxItems)`,
    );
  }

  if (updated.includes(activateOld)) {
    updated = updated.replace(activateOld, activateNew);
  }

  return updated;
}

let restored = false;

if (!(await exists(expected))) {
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
    restored = true;
    console.log(`[postinstall] Restored frontend serviceworker from ${sourcePath}`);
  } else {
    await writeFile(expected, fallback, "utf8");
    restored = true;
    console.log("[postinstall] Created fallback frontend serviceworker");
  }
}

const source = await readFile(expected, "utf8");
const updated = patchServiceworker(source);

if (updated !== source) {
  await writeFile(expected, updated, "utf8");
  console.log("[postinstall] Patched frontend serviceworker auth/session cache bypass");
} else if (!restored) {
  console.log("[postinstall] frontend serviceworker already present");
}
