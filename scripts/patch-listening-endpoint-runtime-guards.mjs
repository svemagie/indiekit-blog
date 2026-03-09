import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "funkwhale-client-scope-me",
    marker: "prefer user-scoped history to avoid instance-wide sync volume",
    oldSnippet: `    return this.fetch("/api/v2/history/listenings", {
      page,
      page_size: pageSize,
      scope: "all",
    });`,
    newSnippet: `    return this.fetch("/api/v2/history/listenings", {
      page,
      page_size: pageSize,
      // prefer user-scoped history to avoid instance-wide sync volume
      scope: this.username ? "me" : "all",
    });`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/funkwhale-client.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/funkwhale-client.js",
    ],
  },
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
  {
    name: "funkwhale-stats-cache-fallback",
    marker: "degrade to empty stats when cache is unavailable on public routes",
    oldSnippet: `        if (!stats) {
          return response.status(503).json({
            error: "Stats not available yet",
            message: "Stats are computed during background sync. Please try again shortly.",
          });
        }`,
    newSnippet: `        if (!stats) {
          // degrade to empty stats when cache is unavailable on public routes
          stats = {
            summary: {
              all: {
                totalPlays: 0,
                totalDuration: 0,
                uniqueTracks: 0,
                uniqueArtists: 0,
                uniqueAlbums: 0,
              },
              month: {
                totalPlays: 0,
                totalDuration: 0,
                uniqueTracks: 0,
                uniqueArtists: 0,
                uniqueAlbums: 0,
              },
              week: {
                totalPlays: 0,
                totalDuration: 0,
                uniqueTracks: 0,
                uniqueArtists: 0,
                uniqueAlbums: 0,
              },
            },
            topArtists: { all: [], month: [], week: [] },
            topAlbums: { all: [], month: [], week: [] },
            trends: [],
          };
        }`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/stats.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/stats.js",
    ],
  },
  {
    name: "funkwhale-trends-cache-fallback",
    marker: "degrade to empty trends when cache is unavailable on public routes",
    oldSnippet: `      // Fall back to cached stats for public routes
      const cachedStats = getCachedStats();
      if (cachedStats?.trends) {
        return response.json({ trends: cachedStats.trends, days: 30 });
      }

      return response.status(503).json({
        error: "Trends not available yet",
        message: "Trends are computed during background sync. Please try again shortly.",
      });`,
    newSnippet: `      // Fall back to cached stats for public routes
      const cachedStats = getCachedStats();
      if (cachedStats?.trends) {
        return response.json({ trends: cachedStats.trends, days: 30 });
      }

      // degrade to empty trends when cache is unavailable on public routes
      return response.json({ trends: [], days });`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/stats.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/stats.js",
    ],
  },
  {
    name: "funkwhale-stats-db-getter",
    marker: "use application database getter for public stats routes",
    oldSnippet: `      // Try database first, fall back to cache for public routes
      const db = request.app.locals.database;
      let stats;`,
    newSnippet: `      // Try database first, fall back to cache for public routes
      // use application database getter for public stats routes
      const db =
        request.app.locals.application.getFunkwhaleDb?.() ||
        request.app.locals.database;
      let stats;`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/stats.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/stats.js",
    ],
  },
  {
    name: "funkwhale-trends-db-getter",
    marker: "use application database getter for public trends routes",
    oldSnippet: `      const db = request.app.locals.database;
      const days = Math.min(parseInt(request.query.days) || 30, 90);`,
    newSnippet: `      // use application database getter for public trends routes
      const db =
        request.app.locals.application.getFunkwhaleDb?.() ||
        request.app.locals.database;
      const days = Math.min(parseInt(request.query.days) || 30, 90);`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/stats.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/controllers/stats.js",
    ],
  },
  {
    name: "funkwhale-sync-date-storage",
    marker: "store listenedAt/syncedAt as Date objects",
    oldSnippet: `    listenedAt: new Date(listening.creation_date).toISOString(),
    syncedAt: new Date().toISOString(),`,
    newSnippet: `    // store listenedAt/syncedAt as Date objects
    listenedAt: new Date(listening.creation_date),
    syncedAt: new Date(),`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
    ],
  },
  {
    name: "funkwhale-sync-legacy-backfill",
    marker: "detect legacy sync keys and force one-time full backfill",
    oldSnippet: `  if (Number.isNaN(latestDate.getTime())) {
    console.warn(
      "[Funkwhale] Invalid listenedAt in latest record; falling back to full sync"
    );
    latestDate = new Date(0);
  }

  console.log(
    \`[Funkwhale] Syncing listenings since: \${latestDate.toISOString()}\`
  );`,
    newSnippet: `  if (Number.isNaN(latestDate.getTime())) {
    console.warn(
      "[Funkwhale] Invalid listenedAt in latest record; falling back to full sync"
    );
    latestDate = new Date(0);
  }

  const totalDocs = await collection.countDocuments();
  const needsLegacyBackfill = totalDocs <= 1 || !latest?.funkwhaleId;
  if (needsLegacyBackfill && totalDocs > 0) {
    // detect legacy sync keys and force one-time full backfill
    console.warn(
      "[Funkwhale] Detected legacy sync keys; forcing full resync for accurate statistics"
    );
    latestDate = new Date(0);
    await collection.deleteMany({
      $or: [{ funkwhaleId: { $exists: false } }, { funkwhaleId: null }],
    });
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
    name: "funkwhale-sync-stable-listening-id",
    marker: "use stable listening event key (fid) for sync upserts",
    oldSnippet: `  return {
    funkwhaleId: listening.id,
    trackId: track.id,
    trackTitle: track.title,
    trackFid: track.fid,
    artistName: artist?.name || getArtistName(track),`,
    newSnippet: `  const stableListeningId =
    listening.fid ||
    [
      track?.fid || track?.id || "unknown-track",
      listening.creation_date || "unknown-date",
    ].join(":");

  return {
    // use stable listening event key (fid) for sync upserts
    funkwhaleId: stableListeningId,
    listeningFid: listening.fid || null,
    trackId: track.id,
    trackTitle: track.title,
    trackFid: track.fid,
    artistName: artist?.name || getArtistName(track),`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
    ],
  },
  {
    name: "funkwhale-sync-safe-transform-loop",
    marker: "skip malformed listenings instead of aborting full sync",
    oldSnippet: `  // Transform to our schema
  const docs = newListenings.map((l) => transformListening(l));

  // Upsert each document (in case of duplicates)`,
    newSnippet: `  // Transform to our schema
  const docs = [];
  for (const listening of newListenings) {
    try {
      docs.push(transformListening(listening));
    } catch (error) {
      // skip malformed listenings instead of aborting full sync
      console.warn(
        "[Funkwhale] Skipping malformed listening during sync:",
        error.message,
      );
    }
  }

  // Upsert each document (in case of duplicates)`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
    ],
  },
  {
    name: "funkwhale-sync-track-null-guard",
    marker: "allow sync of listenings with missing track payload",
    oldSnippet: `  const track = listening.track;
  const artist = track.artist_credit?.[0]?.artist;
  const album = track.album;
  const upload = track.uploads?.[0];`,
    newSnippet: `  // allow sync of listenings with missing track payload
  const track = listening.track || {};
  const artist = track.artist_credit?.[0]?.artist;
  const album = track.album || null;
  const upload = Array.isArray(track.uploads) ? track.uploads[0] : null;`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/sync.js",
    ],
  },
  {
    name: "funkwhale-stats-date-coercion",
    marker: "support string and Date listenedAt values in period filters",
    oldSnippet: `function getDateMatch(period) {
  const now = new Date();
  switch (period) {
    case "week":
      return { listenedAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } };
    case "month":
      return { listenedAt: { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) } };
    default:
      return {};
  }
}`,
    newSnippet: `function getDateMatch(period) {
  const now = new Date();
  let threshold = null;

  switch (period) {
    case "week":
      threshold = new Date(now - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      threshold = new Date(now - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      return {};
  }

  // support string and Date listenedAt values in period filters
  return {
    $expr: {
      $gte: [{ $toDate: "$listenedAt" }, threshold],
    },
  };
}`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/stats.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/stats.js",
    ],
  },
  {
    name: "funkwhale-trends-date-coercion",
    marker: "support string and Date listenedAt values in trends aggregation",
    oldSnippet: `  return collection
    .aggregate([
      { $match: { listenedAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$listenedAt" },
          },`,
    newSnippet: `  return collection
    .aggregate([
      {
        // support string and Date listenedAt values in trends aggregation
        $addFields: {
          listenedAtDate: { $toDate: "$listenedAt" },
        },
      },
      { $match: { listenedAtDate: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$listenedAtDate" },
          },`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/stats.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-funkwhale/lib/stats.js",
    ],
  },
  {
    name: "lastfm-sync-date-storage",
    marker: "store scrobbledAt/syncedAt as Date objects",
    oldSnippet: `    scrobbledAt: scrobbledAtDate.toISOString(),
    syncedAt: new Date().toISOString(),`,
    newSnippet: `    // store scrobbledAt/syncedAt as Date objects
    scrobbledAt: scrobbledAtDate,
    syncedAt: new Date(),`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-lastfm/lib/sync.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-lastfm/lib/sync.js",
    ],
  },
  {
    name: "lastfm-stats-date-coercion",
    marker: "support string and Date scrobbledAt values in period filters",
    oldSnippet: `function getDateMatch(period) {
  const now = new Date();
  switch (period) {
    case "week":
      return { scrobbledAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } };
    case "month":
      return { scrobbledAt: { $gte: new Date(now - 30 * 24 * 60 * 60 * 1000) } };
    default:
      return {};
  }
}`,
    newSnippet: `function getDateMatch(period) {
  const now = new Date();
  let threshold = null;

  switch (period) {
    case "week":
      threshold = new Date(now - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      threshold = new Date(now - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      return {};
  }

  // support string and Date scrobbledAt values in period filters
  return {
    $expr: {
      $gte: [{ $toDate: "$scrobbledAt" }, threshold],
    },
  };
}`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-lastfm/lib/stats.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-lastfm/lib/stats.js",
    ],
  },
  {
    name: "lastfm-trends-date-coercion",
    marker: "support string and Date scrobbledAt values in trends aggregation",
    oldSnippet: `  return collection
    .aggregate([
      { $match: { scrobbledAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$scrobbledAt" },
          },`,
    newSnippet: `  return collection
    .aggregate([
      {
        // support string and Date scrobbledAt values in trends aggregation
        $addFields: {
          scrobbledAtDate: { $toDate: "$scrobbledAt" },
        },
      },
      { $match: { scrobbledAtDate: { $gte: startDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$scrobbledAtDate" },
          },`,
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-lastfm/lib/stats.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-lastfm/lib/stats.js",
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
