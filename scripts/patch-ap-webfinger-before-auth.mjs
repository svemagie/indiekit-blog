/**
 * Patch: serve /.well-known/webfinger (and other /.well-known/ discovery routes)
 * via Fedify BEFORE indiekit's auth middleware redirects them to the login page.
 *
 * Root cause:
 *   indiekit mounts the AP endpoint's `routesWellKnown` router at `/.well-known/`.
 *   Express strips that prefix from req.url, so Fedify sees "/webfinger" instead of
 *   "/.well-known/webfinger" and cannot match its internal route — it calls next().
 *   The request then falls through to indiekit's auth middleware, which issues a 302
 *   redirect to /session/login.  Remote servers (e.g. digitalhub.social) receive
 *   the redirect instead of the JSON response and log a Webfinger error, causing all
 *   subsequent ActivityPub deliveries to that instance to fail with 401 Unauthorized.
 *
 * Fix:
 *   The AP endpoint also registers `contentNegotiationRoutes` at "/", where Express
 *   does NOT strip any prefix and req.path retains the full original path.  This patch
 *   extends the Fedify delegation guard inside that router to also forward any request
 *   whose path starts with "/.well-known/", in addition to the existing "/nodeinfo/"
 *   delegation.  Because `contentNegotiationRoutes` is injected before auth by
 *   patch-indiekit-routes-rate-limits.mjs, Fedify handles the request before auth
 *   middleware ever runs.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
];

const MARKER = "// ap-webfinger-before-auth patch";

const OLD_SNIPPET = `      if (!self._fedifyMiddleware) return next();
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      // Only delegate to Fedify for NodeInfo data endpoint (/nodeinfo/2.1).
      // All other paths in this root-mounted router are handled by the
      // content negotiation catch-all below. Passing arbitrary paths like
      // /notes/... to Fedify causes harmless but noisy 404 warnings.
      if (!req.path.startsWith("/nodeinfo/")) return next();
      return self._fedifyMiddleware(req, res, next);`;

const NEW_SNIPPET = `      if (!self._fedifyMiddleware) return next();
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      // Delegate to Fedify for discovery endpoints:
      //   /.well-known/webfinger  — actor/resource identity resolution
      //   /.well-known/nodeinfo   — server capabilities advertised to the fediverse
      //   /nodeinfo/2.1           — NodeInfo data document
      // This router is mounted at "/" so req.url retains the full path, allowing
      // Fedify to match its internal routes correctly. (routesWellKnown strips
      // the /.well-known/ prefix, causing Fedify to miss the webfinger route.)
      // ap-webfinger-before-auth patch
      const isDiscoveryRoute =
        req.path.startsWith("/nodeinfo/") ||
        req.path.startsWith("/.well-known/");
      if (!isDiscoveryRoute) return next();
      return self._fedifyMiddleware(req, res, next);`;

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

  if (source.includes(MARKER)) {
    console.log(`[postinstall] patch-ap-webfinger-before-auth: already applied to ${filePath}`);
    continue;
  }

  if (!source.includes(OLD_SNIPPET)) {
    console.warn(
      `[postinstall] patch-ap-webfinger-before-auth: target snippet not found in ${filePath} — skipping`,
    );
    continue;
  }

  const updated = source.replace(OLD_SNIPPET, NEW_SNIPPET);

  if (updated === source) {
    console.log(`[postinstall] patch-ap-webfinger-before-auth: no changes applied to ${filePath}`);
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-webfinger-before-auth to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-webfinger-before-auth: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-webfinger-before-auth: already up to date");
} else {
  console.log(
    `[postinstall] patch-ap-webfinger-before-auth: patched ${patched}/${checked} file(s)`,
  );
}
