/**
 * Background sync scheduler for starred repositories
 * Follows the webmention-io startSync/stopSync pattern
 * @module starred-sync
 */

import { fetchAllStarred, fetchAllLists } from "./github-graphql.js";
import {
  ensureIndexes,
  syncStars,
  removeUnstarred,
  annotateWithLists,
  getStarCount,
  getSyncState,
  updateSyncState,
} from "./starred-cache.js";

const SIX_HOURS = 6 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

let incrementalTimer = null;
let fullSyncTimer = null;

let syncStatus = {
  syncing: false,
  lastSync: null,
  lastError: null,
  totalStars: 0,
};

/**
 * Get current sync status (safe copy for templates/API)
 * @returns {object}
 */
export function getStarredSyncStatus() {
  return { ...syncStatus };
}

/**
 * Fetch GitHub Lists and annotate starred repos
 * @param {import("mongodb").Db} db
 * @param {object} options - Plugin options (needs token)
 */
export async function syncListsManual(db, options) {
  return syncLists(db, options);
}

async function syncLists(db, options) {
  try {
    const lists = await fetchAllLists(options.token);

    if (lists.length > 0) {
      const result = await annotateWithLists(db, lists);
      console.log(
        `[GitHub Stars] Lists sync: ${result.listsProcessed} lists, ${result.reposAnnotated} repos annotated`,
      );
    }

    // Store list metadata in sync state
    const listMeta = lists.map((l) => ({
      name: l.name,
      slug: l.slug,
      description: l.description,
      count: l.repoFullNames.length,
    }));

    await updateSyncState(db, { lists: listMeta });
  } catch (error) {
    console.error("[GitHub Stars] Lists sync failed:", error.message);
    // Non-fatal — starred data is still usable without lists
  }
}

/**
 * Start the background sync scheduler
 * @param {object} Indiekit - Indiekit instance
 * @param {object} options - Plugin options (needs token, username)
 */
export function startStarredSync(Indiekit, options) {
  if (!options.token) {
    console.warn("[GitHub Stars] No token configured, starred sync disabled");
    return;
  }

  const db = Indiekit.database;
  if (!db) {
    console.warn("[GitHub Stars] No database available, starred sync disabled");
    return;
  }

  console.log("[GitHub Stars] Starting background sync");

  // Initial sync after 15s delay (let other plugins init first)
  setTimeout(async () => {
    try {
      const collection = db.collection("github_stars");
      await ensureIndexes(collection);

      const count = await getStarCount(collection);
      if (count === 0) {
        console.log("[GitHub Stars] Empty cache, running full sync...");
        await runFullSync(db, options);
      } else {
        console.log(`[GitHub Stars] Cache has ${count} stars, running incremental sync...`);
        await runIncrementalSync(db, options);
      }

      // Sync lists after initial star sync
      await syncLists(db, options);
    } catch (error) {
      console.error("[GitHub Stars] Initial sync error:", error.message);
    }
  }, 15_000);

  // Incremental sync every 6 hours (also re-annotate lists for new stars)
  incrementalTimer = setInterval(async () => {
    try {
      await runIncrementalSync(db, options);
      await syncLists(db, options);
    } catch (err) {
      console.error("[GitHub Stars] Incremental sync error:", err.message);
    }
  }, SIX_HOURS);

  // Full sync every 7 days
  fullSyncTimer = setInterval(() => {
    runFullSync(db, options).catch((err) => {
      console.error("[GitHub Stars] Full sync error:", err.message);
    });
  }, SEVEN_DAYS);
}

/**
 * Stop all sync timers
 */
export function stopStarredSync() {
  if (incrementalTimer) {
    clearInterval(incrementalTimer);
    incrementalTimer = null;
  }
  if (fullSyncTimer) {
    clearInterval(fullSyncTimer);
    fullSyncTimer = null;
  }
}

/**
 * Run incremental sync (fetch first 2 pages = 200 most recent stars)
 * @param {import("mongodb").Db} db
 * @param {object} options - Plugin options
 * @returns {Promise<object>} Sync result
 */
export async function runIncrementalSync(db, options) {
  if (syncStatus.syncing) {
    return { error: "Sync already in progress" };
  }

  syncStatus.syncing = true;
  syncStatus.lastError = null;

  try {
    const collection = db.collection("github_stars");
    await ensureIndexes(collection);

    const { stars } = await fetchAllStarred(options.token, { maxPages: 2 });

    const result = await syncStars(collection, stars);
    const totalStars = await getStarCount(collection);

    syncStatus.lastSync = new Date().toISOString();
    syncStatus.totalStars = totalStars;
    syncStatus.syncing = false;

    await updateSyncState(db, {
      lastIncrementalSync: syncStatus.lastSync,
      totalStars,
    });

    console.log(
      `[GitHub Stars] Incremental sync: ${result.upserted} new, ${result.modified} updated, ${totalStars} total`,
    );

    return { ...result, totalStars };
  } catch (error) {
    syncStatus.lastError = error.message;
    syncStatus.syncing = false;
    console.error("[GitHub Stars] Incremental sync failed:", error.message);
    return { error: error.message };
  }
}

/**
 * Run full sync (fetch ALL starred repos, remove unstarred)
 * @param {import("mongodb").Db} db
 * @param {object} options - Plugin options
 * @returns {Promise<object>} Sync result
 */
export async function runFullSync(db, options) {
  if (syncStatus.syncing) {
    return { error: "Sync already in progress" };
  }

  syncStatus.syncing = true;
  syncStatus.lastError = null;

  try {
    const collection = db.collection("github_stars");
    await ensureIndexes(collection);

    const { stars, totalCount } = await fetchAllStarred(options.token, {
      onPage: (page, fetched, total) => {
        console.log(`[GitHub Stars] Full sync: page ${page}, ${fetched}/${total} fetched`);
      },
    });

    const result = await syncStars(collection, stars);

    // Remove repos that were unstarred
    const currentNames = new Set(stars.map((s) => s.fullName));
    const removed = await removeUnstarred(collection, currentNames);

    const totalStars = await getStarCount(collection);

    syncStatus.lastSync = new Date().toISOString();
    syncStatus.totalStars = totalStars;
    syncStatus.syncing = false;

    await updateSyncState(db, {
      lastFullSync: syncStatus.lastSync,
      lastIncrementalSync: syncStatus.lastSync,
      totalStars,
    });

    // Sync lists during full sync
    await syncLists(db, options);

    console.log(
      `[GitHub Stars] Full sync complete: ${result.upserted} new, ${result.modified} updated, ${removed} removed, ${totalStars} total (GitHub reports ${totalCount})`,
    );

    return { ...result, removed, totalStars, totalCount };
  } catch (error) {
    syncStatus.lastError = error.message;
    syncStatus.syncing = false;
    console.error("[GitHub Stars] Full sync failed:", error.message);
    return { error: error.message };
  }
}
