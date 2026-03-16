import { access, readFile, writeFile } from "node:fs/promises";

const filePath = "node_modules/@indiekit/endpoint-posts/lib/endpoint.js";

const marker = "// [patch] fetch-diagnostic";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(filePath))) {
  console.log("[postinstall] endpoint-posts endpoint.js not found — skipping fetch-diagnostic patch");
  process.exit(0);
}

const source = await readFile(filePath, "utf8");

if (source.includes(marker)) {
  console.log("[postinstall] endpoint-posts fetch-diagnostic patch already applied");
  process.exit(0);
}

// Wrap the fetch calls to log the underlying cause on failure
const oldPost = `  async post(url, accessToken, jsonBody = false) {
    const endpointResponse = await fetch(url, {`;

const newPost = `  ${marker}
  async post(url, accessToken, jsonBody = false) {
    let endpointResponse;
    try {
      endpointResponse = await fetch(url, {`;

const oldPostEnd = `    });

    if (!endpointResponse.ok) {
      throw await IndiekitError.fromFetch(endpointResponse);
    }

    return endpointResponse.status === 204
      ? { success_description: endpointResponse.headers.get("location") }
      : await endpointResponse.json();
  },
};`;

const newPostEnd = `    });
    } catch (fetchError) {
      const cause = fetchError.cause || fetchError;
      console.error("[endpoint-posts] fetch failed for POST %s — %s: %s", url, cause.code || cause.name, cause.message);
      if (cause.cause) console.error("[endpoint-posts]   nested cause: %s", cause.cause.message || cause.cause);
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

const oldGet = `  async get(url, accessToken) {
    const endpointResponse = await fetch(url, {`;

const newGet = `  async get(url, accessToken) {
    let endpointResponse;
    try {
      endpointResponse = await fetch(url, {`;

const oldGetEnd = `    });

    if (!endpointResponse.ok) {
      throw await IndiekitError.fromFetch(endpointResponse);
    }

    const body = await endpointResponse.json();

    return body;
  },`;

const newGetEnd = `    });
    } catch (fetchError) {
      const cause = fetchError.cause || fetchError;
      console.error("[endpoint-posts] fetch failed for GET %s — %s: %s", url, cause.code || cause.name, cause.message);
      if (cause.cause) console.error("[endpoint-posts]   nested cause: %s", cause.cause.message || cause.cause);
      throw fetchError;
    }

    if (!endpointResponse.ok) {
      throw await IndiekitError.fromFetch(endpointResponse);
    }

    const body = await endpointResponse.json();

    return body;
  },`;

let updated = source;
updated = updated.replace(oldPost, newPost);
updated = updated.replace(oldPostEnd, newPostEnd);
updated = updated.replace(oldGet, newGet);
updated = updated.replace(oldGetEnd, newGetEnd);

if (!updated.includes(marker)) {
  console.warn("[postinstall] Skipping endpoint-posts fetch-diagnostic patch: upstream format changed");
  process.exit(0);
}

await writeFile(filePath, updated, "utf8");
console.log("[postinstall] Patched endpoint-posts with fetch diagnostic logging");
