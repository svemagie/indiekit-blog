import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "lastfm-invalid-json-guard",
    marker: "Invalid JSON response preview",
    oldSnippet: "    const data = await response.json();",
    newSnippet: `    const rawBody = await response.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      const preview = rawBody.slice(0, 200).replace(/\\s+/g, " ").trim();
      console.error("[Last.fm] Invalid JSON response preview:", preview);
      throw new Error("Last.fm API returned invalid JSON");
    }`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-lastfm/lib/lastfm-client.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-lastfm/lib/lastfm-client.js",
    ],
  },
  {
    name: "funkwhale-sync-not-found-guard",
    marker: "Remote API endpoint not found; skipping sync",
    oldSnippet: `  const result = await syncListenings(db, client);

  // Update stats cache after sync`,
    newSnippet: `  let result;
  try {
    result = await syncListenings(db, client);
  } catch (err) {
    const status = Number(err?.status || err?.statusCode || 0);
    const message = String(err?.message || "");
    if (status === 404 || /not found/i.test(message)) {
      console.warn(
        "[Funkwhale] Remote API endpoint not found; skipping sync. Check FUNKWHALE_INSTANCE points to your Funkwhale server root URL."
      );
      return { synced: 0, error: "Not Found" };
    }
    throw err;
  }

  // Update stats cache after sync`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
    ],
  },
  {
    name: "funkwhale-latest-date-coercion",
    marker: "Invalid listenedAt in latest record; falling back to full sync",
    oldSnippet: `  const latest = await collection.findOne({}, { sort: { listenedAt: -1 } });
  const latestDate = latest?.listenedAt || new Date(0);

  console.log(
    \`[Funkwhale] Syncing listenings since: \${latestDate.toISOString()}\`
  );`,
    newSnippet: `  const latest = await collection.findOne({}, { sort: { listenedAt: -1 } });
  const latestRawDate = latest?.listenedAt;
  let latestDate = latestRawDate ? new Date(latestRawDate) : new Date(0);

  if (Number.isNaN(latestDate.getTime())) {
    console.warn(
      "[Funkwhale] Invalid listenedAt in latest record; falling back to full sync"
    );
    latestDate = new Date(0);
  }

  console.log(
    \`[Funkwhale] Syncing listenings since: \${latestDate.toISOString()}\`
  );`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
    ],
  },
  {
    name: "funkwhale-now-playing-fallback",
    marker: "degrade to empty now-playing response when upstream endpoint is missing",
    oldSnippet: `    } catch (error) {
      console.error("[Funkwhale] Now Playing API error:", error);
      response.status(500).json({ error: error.message });
    }`,
    newSnippet: `    } catch (error) {
      const message = String(error?.message || "");
      // degrade to empty now-playing response when upstream endpoint is missing
      if (/not found/i.test(message)) {
        return response.json({
          playing: false,
          status: null,
          message: "No recent plays",
        });
      }

      console.error("[Funkwhale] Now Playing API error:", error);
      response.status(500).json({ error: message || "Unknown error" });
    }`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/now-playing.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/now-playing.js",
    ],
  },
  {
    name: "funkwhale-listenings-fallback",
    marker: "degrade to empty listening history when upstream endpoint is missing",
    oldSnippet: `    } catch (error) {
      console.error("[Funkwhale] Listenings API error:", error);
      response.status(500).json({ error: error.message });
    }`,
    newSnippet: `    } catch (error) {
      const message = String(error?.message || "");
      // degrade to empty listening history when upstream endpoint is missing
      if (/not found/i.test(message)) {
        const fallbackPage = Number.parseInt(request.query.page, 10) || 1;
        return response.json({
          listenings: [],
          total: 0,
          page: fallbackPage,
          hasNext: false,
          hasPrev: false,
        });
      }

      console.error("[Funkwhale] Listenings API error:", error);
      response.status(500).json({ error: message || "Unknown error" });
    }`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/listenings.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/listenings.js",
    ],
  },
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let filesChecked = 0;
let filesPatched = 0;

for (const spec of patchSpecs) {
  let foundAnyTarget = false;

  for (const filePath of spec.candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    filesChecked += 1;

    const source = await readFile(filePath, "utf8");

    if (source.includes(spec.marker)) {
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
      continue;
    }

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);
    await writeFile(filePath, updated, "utf8");
    filesPatched += 1;
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (filesChecked === 0) {
  console.log("[postinstall] No listening endpoint files found");
} else if (filesPatched === 0) {
  console.log("[postinstall] listening endpoint runtime guards already patched");
} else {
  console.log(
    `[postinstall] Patched listening endpoint runtime guards in ${filesPatched}/${filesChecked} file(s)`,
  );
}
