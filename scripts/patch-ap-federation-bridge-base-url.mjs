/**
 * Patch: override Fedify request URL with the configured publication URL.
 *
 * Root cause:
 *   fromExpressRequest() in federation-bridge.js builds the Request URL as
 *   `${req.protocol}://${req.get("host")}${req.originalUrl}`. Fedify only handles
 *   requests whose URL matches its configured base URL (https://blog.giersig.eu).
 *   If nginx does not forward `Host: blog.giersig.eu` and `X-Forwarded-Proto: https`,
 *   the URL Fedify sees will be wrong (e.g. http://127.0.0.1:3000/...) and Fedify
 *   calls next() → the request falls through to auth middleware → returns 302 to
 *   the login page. This breaks webfinger, nodeinfo, actor lookups, and AP inbox
 *   delivery for any server that cannot follow the redirect.
 *
 * Fix:
 *   - Add an optional third parameter `publicationUrl` to createFedifyMiddleware().
 *   - Pass it through to fromExpressRequest(), which uses it as the URL base when
 *     provided, ignoring req.protocol / req.get("host") entirely.
 *   - In index.js, pass `this._publicationUrl` to createFedifyMiddleware() so all
 *     Fedify-delegated requests use the correct canonical URL.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const MARKER = "// ap-base-url patch";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-bridge.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/federation-bridge.js",
];

const indexCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
];

// ---------------------------------------------------------------------------
// Patches for federation-bridge.js
// ---------------------------------------------------------------------------

const OLD_FROM_EXPRESS_SIG = `export function fromExpressRequest(req) {
  const url = \`\${req.protocol}://\${req.get("host")}\${req.originalUrl}\`;`;

const NEW_FROM_EXPRESS_SIG = `export function fromExpressRequest(req, baseUrl) { // ap-base-url patch
  const url = baseUrl
    ? \`\${baseUrl.replace(/\\/$/, "")}\${req.originalUrl}\` // ap-base-url patch
    : \`\${req.protocol}://\${req.get("host")}\${req.originalUrl}\`;`;

const OLD_MIDDLEWARE_SIG = `export function createFedifyMiddleware(federation, contextDataFactory) {`;

const NEW_MIDDLEWARE_SIG = `export function createFedifyMiddleware(federation, contextDataFactory, publicationUrl) { // ap-base-url patch`;

const OLD_FROM_EXPRESS_CALL = `      const request = fromExpressRequest(req);`;

const NEW_FROM_EXPRESS_CALL = `      const request = fromExpressRequest(req, publicationUrl); // ap-base-url patch`;

// ---------------------------------------------------------------------------
// Patch for index.js
// ---------------------------------------------------------------------------

const OLD_INDEX_CALL = `    this._fedifyMiddleware = createFedifyMiddleware(federation, () => ({}));`;

const NEW_INDEX_CALL = `    this._fedifyMiddleware = createFedifyMiddleware(federation, () => ({}), this._publicationUrl); // ap-base-url patch`;

// ---------------------------------------------------------------------------

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let patched = 0;
let checked = 0;

// Patch federation-bridge.js
for (const filePath of candidates) {
  if (!(await exists(filePath))) continue;
  checked += 1;
  const source = await readFile(filePath, "utf8");

  if (source.includes(MARKER)) {
    console.log(`[postinstall] patch-ap-federation-bridge-base-url: already applied to ${filePath}`);
    continue;
  }

  let updated = source;
  let changed = false;

  if (updated.includes(OLD_FROM_EXPRESS_SIG)) {
    updated = updated.replace(OLD_FROM_EXPRESS_SIG, NEW_FROM_EXPRESS_SIG);
    changed = true;
  } else {
    console.warn(`[postinstall] patch-ap-federation-bridge-base-url: fromExpressRequest signature not found in ${filePath}`);
  }

  if (updated.includes(OLD_MIDDLEWARE_SIG)) {
    updated = updated.replace(OLD_MIDDLEWARE_SIG, NEW_MIDDLEWARE_SIG);
    changed = true;
  } else {
    console.warn(`[postinstall] patch-ap-federation-bridge-base-url: createFedifyMiddleware signature not found in ${filePath}`);
  }

  if (updated.includes(OLD_FROM_EXPRESS_CALL)) {
    updated = updated.replace(OLD_FROM_EXPRESS_CALL, NEW_FROM_EXPRESS_CALL);
    changed = true;
  } else {
    console.warn(`[postinstall] patch-ap-federation-bridge-base-url: fromExpressRequest call not found in ${filePath}`);
  }

  if (!changed || updated === source) {
    console.log(`[postinstall] patch-ap-federation-bridge-base-url: no changes applied to ${filePath}`);
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-federation-bridge-base-url to ${filePath}`);
}

// Patch index.js
for (const filePath of indexCandidates) {
  if (!(await exists(filePath))) continue;
  const source = await readFile(filePath, "utf8");

  if (source.includes(MARKER)) {
    console.log(`[postinstall] patch-ap-federation-bridge-base-url: index.js already patched at ${filePath}`);
    continue;
  }

  if (!source.includes(OLD_INDEX_CALL)) {
    console.warn(`[postinstall] patch-ap-federation-bridge-base-url: createFedifyMiddleware call not found in ${filePath}`);
    continue;
  }

  const updated = source.replace(OLD_INDEX_CALL, NEW_INDEX_CALL);

  if (updated === source) {
    console.log(`[postinstall] patch-ap-federation-bridge-base-url: no changes in index.js at ${filePath}`);
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-federation-bridge-base-url (index.js) to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-federation-bridge-base-url: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-federation-bridge-base-url: already up to date");
} else {
  console.log(`[postinstall] patch-ap-federation-bridge-base-url: patched ${patched} file(s)`);
}
