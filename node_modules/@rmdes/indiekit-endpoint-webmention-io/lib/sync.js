/**
 * Background sync from webmention.io
 */

import { extractDomain } from "./utils.js";
import {
  ensureIndexes,
  upsertWebmention,
  getMaxWmId,
  deleteAll,
  hideByDomain,
  getDomainsWithMissingPhotos,
  updateAuthorDataByDomain,
} from "./storage/webmentions.js";
import {
  ensureBlocklistIndexes,
  getBlockedDomainSet,
} from "./storage/blocklist.js";
import { discoverAuthorData } from "./hcard.js";

let syncInterval = null;
let syncState = {
  lastSync: null,
  syncing: false,
  lastError: null,
  mentionsAdded: 0,
  mentionsFiltered: 0,
};

/**
 * Get current sync state
 * @returns {object}
 */
export function getSyncState() {
  return { ...syncState };
}

/**
 * Start background sync
 * @param {object} Indiekit - Indiekit instance
 * @param {object} options - Plugin options
 */
export function startSync(Indiekit, options) {
  const intervalMs = options.syncInterval || 900_000; // 15 minutes

  console.log(
    `[Webmentions] Starting background sync with ${intervalMs / 60_000}min interval`,
  );

  // Initial sync after delay
  setTimeout(() => {
    runSync(Indiekit, options).catch((err) => {
      console.error("[Webmentions] Initial sync error:", err.message);
    });
  }, 10_000);

  // Recurring sync
  syncInterval = setInterval(() => {
    runSync(Indiekit, options).catch((err) => {
      console.error("[Webmentions] Sync error:", err.message);
    });
  }, intervalMs);
}

/**
 * Stop background sync
 */
export function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/**
 * Run a single incremental sync cycle
 * @param {object} dbOrIndiekit - Database or Indiekit instance
 * @param {object} options - Plugin options
 * @returns {Promise<object>}
 */
export async function runSync(dbOrIndiekit, options) {
  const db = dbOrIndiekit.database || dbOrIndiekit;
  if (!db || typeof db.collection !== "function") {
    syncState.lastError = "No database available";
    return { error: syncState.lastError };
  }

  if (syncState.syncing) {
    return { error: "Sync already in progress" };
  }

  syncState.syncing = true;
  syncState.lastError = null;
  syncState.mentionsAdded = 0;
  syncState.mentionsFiltered = 0;

  try {
    const wmCollection = db.collection("webmentions");
    const blockCollection = db.collection("webmentionBlocklist");

    await ensureIndexes(wmCollection);
    await ensureBlocklistIndexes(blockCollection);

    // Get highest wmId for incremental sync
    const sinceId = await getMaxWmId(wmCollection);

    // Get blocked domains
    const blockedDomains = await getBlockedDomainSet(blockCollection);

    // Fetch pages from webmention.io
    let page = 0;
    let hasMore = true;
    const perPage = 100;

    while (hasMore) {
      const items = await fetchPage(options, { page, perPage, sinceId });

      if (!items || items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        const domain = extractDomain(item.author?.url || item.url || "");

        if (domain && blockedDomains.has(domain)) {
          syncState.mentionsFiltered++;
          continue;
        }

        const isNew = await upsertWebmention(wmCollection, item);
        if (isNew) {
          syncState.mentionsAdded++;
        }
      }

      page++;

      // Rate limit: small delay between pages
      if (items.length >= perPage) {
        await delay(500);
      } else {
        hasMore = false;
      }
    }

    // Enrich entries with missing author photos via h-card discovery
    const enriched = await enrichMissingPhotos(db, wmCollection);

    syncState.lastSync = new Date().toISOString();
    syncState.syncing = false;

    console.log(
      `[Webmentions] Sync complete: ${syncState.mentionsAdded} new, ${syncState.mentionsFiltered} filtered, ${enriched} enriched`,
    );

    return {
      mentionsAdded: syncState.mentionsAdded,
      mentionsFiltered: syncState.mentionsFiltered,
      mentionsEnriched: enriched,
    };
  } catch (error) {
    syncState.lastError = error.message;
    syncState.syncing = false;
    console.error("[Webmentions] Sync failed:", error.message);
    return { error: error.message };
  }
}

/**
 * Run a full re-sync (clear + fetch all)
 * @param {object} dbOrIndiekit - Database or Indiekit instance
 * @param {object} options - Plugin options
 * @returns {Promise<object>}
 */
export async function runFullSync(dbOrIndiekit, options) {
  const db = dbOrIndiekit.database || dbOrIndiekit;
  if (!db || typeof db.collection !== "function") {
    return { error: "No database available" };
  }

  if (syncState.syncing) {
    return { error: "Sync already in progress" };
  }

  syncState.syncing = true;
  syncState.lastError = null;
  syncState.mentionsAdded = 0;
  syncState.mentionsFiltered = 0;

  try {
    const wmCollection = db.collection("webmentions");
    const blockCollection = db.collection("webmentionBlocklist");

    await ensureIndexes(wmCollection);
    await ensureBlocklistIndexes(blockCollection);

    // Clear all existing webmentions
    const deleted = await deleteAll(wmCollection);
    console.log(`[Webmentions] Full sync: cleared ${deleted} existing mentions`);

    // Get blocked domains
    const blockedDomains = await getBlockedDomainSet(blockCollection);

    // Fetch ALL pages from webmention.io (no sinceId)
    let page = 0;
    let hasMore = true;
    const perPage = 100;

    while (hasMore) {
      const items = await fetchPage(options, { page, perPage });

      if (!items || items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        const domain = extractDomain(item.author?.url || item.url || "");

        if (domain && blockedDomains.has(domain)) {
          syncState.mentionsFiltered++;
          continue;
        }

        const isNew = await upsertWebmention(wmCollection, item);
        if (isNew) {
          syncState.mentionsAdded++;
        }
      }

      page++;

      // Rate limit between pages
      if (items.length >= perPage) {
        await delay(1000);
      } else {
        hasMore = false;
      }
    }

    // Enrich entries with missing author photos via h-card discovery
    const enriched = await enrichMissingPhotos(db, wmCollection);

    syncState.lastSync = new Date().toISOString();
    syncState.syncing = false;

    console.log(
      `[Webmentions] Full sync complete: ${syncState.mentionsAdded} imported, ${syncState.mentionsFiltered} filtered, ${enriched} enriched`,
    );

    return {
      mentionsAdded: syncState.mentionsAdded,
      mentionsFiltered: syncState.mentionsFiltered,
      mentionsEnriched: enriched,
    };
  } catch (error) {
    syncState.lastError = error.message;
    syncState.syncing = false;
    console.error("[Webmentions] Full sync failed:", error.message);
    return { error: error.message };
  }
}

/**
 * Enrich webmention entries that have missing author photos by discovering
 * h-card data from the source domain's homepage.
 * @param {object} db - MongoDB database instance
 * @param {object} wmCollection - Webmentions collection
 * @returns {Promise<number>} Total entries updated
 */
async function enrichMissingPhotos(db, wmCollection) {
  let totalUpdated = 0;

  try {
    const domains = await getDomainsWithMissingPhotos(wmCollection);

    if (domains.length === 0) return 0;

    const cacheCollection = db.collection("hcardCache");
    await cacheCollection.createIndex({ domain: 1 }, { unique: true });

    for (const domain of domains) {
      const data = await discoverAuthorData(domain, cacheCollection);

      if (data.photoUrl || data.authorUrl) {
        const updated = await updateAuthorDataByDomain(
          wmCollection,
          domain,
          data,
        );
        totalUpdated += updated;

        if (updated > 0) {
          console.log(
            `[Webmentions] Enriched ${updated} entries for ${domain}`,
          );
        }
      }

      // Small delay between domain lookups
      await delay(200);
    }
  } catch (error) {
    console.error(
      "[Webmentions] h-card enrichment error:",
      error.message,
    );
  }

  return totalUpdated;
}

/**
 * Fetch a single page from webmention.io API
 * @param {object} options - Plugin options (token, domain)
 * @param {object} params - Fetch params (page, perPage, sinceId)
 * @returns {Promise<Array>} Array of JF2 entries
 */
async function fetchPage(options, params = {}) {
  const url = new URL("https://webmention.io/api/mentions.jf2");
  url.searchParams.set("token", options.token);
  url.searchParams.set("domain", options.domain);
  url.searchParams.set("per-page", String(params.perPage || 100));

  if (params.page) {
    url.searchParams.set("page", String(params.page));
  }

  if (params.sinceId) {
    url.searchParams.set("since_id", String(params.sinceId));
  }

  const response = await fetch(url.href, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`webmention.io returned ${response.status}`);
  }

  const body = await response.json();
  return body?.children || [];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
