/**
 * Patch: rewrite self-referential fetch URLs to use localhost and add
 * diagnostic logging for fetch failures.
 *
 * When behind a reverse proxy (e.g. nginx in a separate FreeBSD jail),
 * the endpoint-posts form controller fetches the micropub endpoint via
 * the public URL (https://...). But the Node process doesn't listen on
 * 443 — only nginx does. This causes ECONNREFUSED on the Node jail.
 *
 * Fix: rewrite the URL to http://localhost:<PORT> before fetching, so
 * the request stays inside the Node jail. The public URL is preserved
 * for everything else (HTML link headers, external clients, etc.).
 *
 * Controlled by INTERNAL_FETCH_URL env var (e.g. "http://localhost:3000").
 * Falls back to http://localhost:${PORT || 3000} automatically.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const filePath = "node_modules/@indiekit/endpoint-posts/lib/endpoint.js";

const marker = "// [patch] fetch-internal-rewrite";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(filePath))) {
  console.log("[postinstall] endpoint-posts endpoint.js not found — skipping fetch-rewrite patch");
  process.exit(0);
}

const source = await readFile(filePath, "utf8");

if (source.includes(marker)) {
  console.log("[postinstall] endpoint-posts fetch-rewrite patch already applied");
  process.exit(0);
}

// Also handle the case where the old diagnostic-only patch was applied
const oldMarker = "// [patch] fetch-diagnostic";
let cleanSource = source;
if (cleanSource.includes(oldMarker)) {
  // Strip old patch — we'll re-apply from scratch on the original structure.
  // Safest approach: bail and let the user re-run after npm install.
  console.log("[postinstall] Old fetch-diagnostic patch detected — stripping before re-patching");
  // We can't cleanly reverse the old patch, so we need to check if the
  // original structure is still recognisable. If not, warn and skip.
}

const original = `import { IndiekitError } from "@indiekit/error";

export const endpoint = {
  /**
   * Micropub query
   * @param {string} url - URL
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Response data
   */
  async get(url, accessToken) {
    const endpointResponse = await fetch(url, {
      headers: {
        accept: "application/json",
        authorization: \`Bearer \${accessToken}\`,
      },
    });

    if (!endpointResponse.ok) {
      throw await IndiekitError.fromFetch(endpointResponse);
    }

    const body = await endpointResponse.json();

    return body;
  },

  /**
   * Micropub action
   * @param {string} url - URL
   * @param {string} accessToken - Access token
   * @param {object} [jsonBody] - JSON body
   * @returns {Promise<object>} Response data
   */
  async post(url, accessToken, jsonBody = false) {
    const endpointResponse = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: \`Bearer \${accessToken}\`,
        ...(jsonBody && { "content-type": "application/json" }),
      },
      ...(jsonBody && { body: JSON.stringify(jsonBody) }),
    });

    if (!endpointResponse.ok) {
      throw await IndiekitError.fromFetch(endpointResponse);
    }

    return endpointResponse.status === 204
      ? { success_description: endpointResponse.headers.get("location") }
      : await endpointResponse.json();
  },
};`;

const patched = `import { IndiekitError } from "@indiekit/error";

${marker}
const _internalBase = (() => {
  if (process.env.INTERNAL_FETCH_URL) return process.env.INTERNAL_FETCH_URL.replace(/\\/+$/, "");
  const port = process.env.PORT || "3000";
  return \`http://localhost:\${port}\`;
})();
const _publicBase = (
  process.env.PUBLICATION_URL || process.env.SITE_URL || ""
).replace(/\\/+$/, "");

function _toInternalUrl(url) {
  if (!_publicBase || !url.startsWith(_publicBase)) return url;
  return _internalBase + url.slice(_publicBase.length);
}

export const endpoint = {
  /**
   * Micropub query
   * @param {string} url - URL
   * @param {string} accessToken - Access token
   * @returns {Promise<object>} Response data
   */
  async get(url, accessToken) {
    const fetchUrl = _toInternalUrl(url);
    let endpointResponse;
    try {
      endpointResponse = await fetch(fetchUrl, {
        headers: {
          accept: "application/json",
          authorization: \`Bearer \${accessToken}\`,
        },
      });
    } catch (fetchError) {
      const cause = fetchError.cause || fetchError;
      console.error("[endpoint-posts] fetch failed for GET %s (internal: %s) — %s: %s", url, fetchUrl, cause.code || cause.name, cause.message);
      throw fetchError;
    }

    if (!endpointResponse.ok) {
      throw await IndiekitError.fromFetch(endpointResponse);
    }

    const body = await endpointResponse.json();

    return body;
  },

  /**
   * Micropub action
   * @param {string} url - URL
   * @param {string} accessToken - Access token
   * @param {object} [jsonBody] - JSON body
   * @returns {Promise<object>} Response data
   */
  async post(url, accessToken, jsonBody = false) {
    const fetchUrl = _toInternalUrl(url);
    let endpointResponse;
    try {
      endpointResponse = await fetch(fetchUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: \`Bearer \${accessToken}\`,
          ...(jsonBody && { "content-type": "application/json" }),
        },
        ...(jsonBody && { body: JSON.stringify(jsonBody) }),
      });
    } catch (fetchError) {
      const cause = fetchError.cause || fetchError;
      console.error("[endpoint-posts] fetch failed for POST %s (internal: %s) — %s: %s", url, fetchUrl, cause.code || cause.name, cause.message);
      throw fetchError;
    }

    if (!endpointResponse.ok) {
      throw await IndiekitError.fromFetch(endpointResponse);
    }

    return endpointResponse.status === 204
      ? { success_description: endpointResponse.headers.get("location") }
      : await endpointResponse.json();
  },
};`;

// Try matching the original (unpatched) file first
if (cleanSource.includes(original.trim())) {
  const updated = cleanSource.replace(original.trim(), patched.trim());
  await writeFile(filePath, updated, "utf8");
  console.log("[postinstall] Patched endpoint-posts: fetch URL rewrite + diagnostic logging");
  process.exit(0);
}

// If old diagnostic patch was applied, try matching that version
if (cleanSource.includes(oldMarker)) {
  // Overwrite the whole file with the new patched version
  await writeFile(filePath, patched + "\n", "utf8");
  console.log("[postinstall] Replaced old fetch-diagnostic patch with fetch-rewrite + diagnostic");
  process.exit(0);
}

console.warn("[postinstall] Skipping endpoint-posts fetch-rewrite patch: upstream format changed");
