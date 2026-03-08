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

const layoutCandidates = [
  "node_modules/@indiekit/frontend/layouts/default.njk",
  "node_modules/@rmdes/indiekit-frontend/layouts/default.njk",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/frontend/layouts/default.njk",
  "node_modules/@indiekit/endpoint-posts/node_modules/@indiekit/frontend/layouts/default.njk",
  "node_modules/@rmdes/indiekit-endpoint-conversations/node_modules/@indiekit/frontend/layouts/default.njk",
  "node_modules/@rmdes/indiekit-endpoint-webmention-io/node_modules/@indiekit/frontend/layouts/default.njk",
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

const registrationScriptRegex =
  /<script type="module">\n\s*if \(navigator\.serviceWorker\) \{\n[\s\S]*?<\/script>/m;

const sidebarConditionOld = "{% if not minimalui %}";
const sidebarConditionNew =
  "{% if not minimalui and ('app--minimalui' not in appClasses) %}";

const registrationDisableMarker = "disable stale service-worker caches";
const registrationDisableScript = `<script type="module">
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister()),
        );

        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch (error) {
        console.error("Failed to disable stale service-worker caches", error);
      }
    });
  }
</script>`;

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

function patchLayout(content) {
  let updated = content;

  if (
    updated.includes(sidebarConditionOld) &&
    !updated.includes(sidebarConditionNew)
  ) {
    updated = updated.replace(sidebarConditionOld, sidebarConditionNew);
  }

  if (
    !updated.includes(registrationDisableMarker) &&
    registrationScriptRegex.test(updated)
  ) {
    updated = updated.replace(registrationScriptRegex, registrationDisableScript);
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

let serviceworkerPatched = false;
if (updated !== source) {
  await writeFile(expected, updated, "utf8");
  serviceworkerPatched = true;
}

let layoutPatched = 0;
for (const layoutPath of layoutCandidates) {
  if (!(await exists(layoutPath))) {
    continue;
  }

  const layoutSource = await readFile(layoutPath, "utf8");
  const layoutUpdated = patchLayout(layoutSource);
  if (layoutUpdated !== layoutSource) {
    await writeFile(layoutPath, layoutUpdated, "utf8");
    layoutPatched += 1;
  }
}

if (serviceworkerPatched) {
  console.log("[postinstall] Patched frontend serviceworker auth/session cache bypass");
}

if (layoutPatched > 0) {
  console.log(
    `[postinstall] Patched frontend layout serviceworker unregister in ${layoutPatched} file(s)`,
  );
}

if (!restored && !serviceworkerPatched && layoutPatched === 0) {
  console.log("[postinstall] frontend serviceworker already present");
}
