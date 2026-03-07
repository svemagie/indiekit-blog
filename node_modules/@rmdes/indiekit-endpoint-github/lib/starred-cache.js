/**
 * MongoDB cache layer for starred repositories
 * Follows the webmention-io pattern: receives db object, not Indiekit instance
 * @module starred-cache
 */

/**
 * Ensure required indexes exist on the github_stars collection
 * @param {import("mongodb").Collection} collection
 */
export async function ensureIndexes(collection) {
  await collection.createIndex({ fullName: 1 }, { unique: true });
  await collection.createIndex({ starredAt: -1 });
  await collection.createIndex({ language: 1 });
  await collection.createIndex({ lists: 1 });
}

/**
 * Bulk upsert starred repos into the collection
 * Uses fullName as unique key
 * @param {import("mongodb").Collection} collection
 * @param {Array} stars - Array of formatted starred repos
 * @returns {Promise<{upserted: number, modified: number}>}
 */
export async function syncStars(collection, stars) {
  if (!stars || stars.length === 0) return { upserted: 0, modified: 0 };

  const operations = stars.map((star) => ({
    updateOne: {
      filter: { fullName: star.fullName },
      update: {
        $set: {
          ...star,
          updatedAt: new Date().toISOString(),
        },
      },
      upsert: true,
    },
  }));

  // Process in batches of 500 to avoid MongoDB limits
  let upserted = 0;
  let modified = 0;

  for (let i = 0; i < operations.length; i += 500) {
    const batch = operations.slice(i, i + 500);
    const result = await collection.bulkWrite(batch, { ordered: false });
    upserted += result.upsertedCount;
    modified += result.modifiedCount;
  }

  return { upserted, modified };
}

/**
 * Remove starred repos that no longer exist in the full list
 * Called during full sync to handle unstarred repos
 * @param {import("mongodb").Collection} collection
 * @param {Set<string>} currentFullNames - Set of all current starred repo fullNames
 * @returns {Promise<number>} Number of removed repos
 */
export async function removeUnstarred(collection, currentFullNames) {
  const result = await collection.deleteMany({
    fullName: { $nin: [...currentFullNames] },
  });
  return result.deletedCount;
}

/**
 * Annotate starred repos with their GitHub List memberships
 * Builds a fullName→slugs map in memory, then uses ordered bulkWrite
 * to minimize the race window where concurrent reads see empty lists
 * @param {import("mongodb").Db} db
 * @param {Array<{slug: string, repoFullNames: string[]}>} lists
 * @returns {Promise<{listsProcessed: number, reposAnnotated: number}>}
 */
export async function annotateWithLists(db, lists) {
  const collection = db.collection("github_stars");

  // Build fullName → slugs map in memory
  const repoToLists = new Map();
  for (const list of lists) {
    for (const fullName of list.repoFullNames) {
      if (!repoToLists.has(fullName)) repoToLists.set(fullName, []);
      repoToLists.get(fullName).push(list.slug);
    }
  }

  // Single ordered bulkWrite: reset all, then set per-repo lists
  const ops = [
    { updateMany: { filter: {}, update: { $set: { lists: [] } } } },
    ...[...repoToLists.entries()].map(([fullName, slugs]) => ({
      updateOne: {
        filter: { fullName },
        update: { $set: { lists: slugs } },
      },
    })),
  ];

  // Process in batches of 1000 to avoid MongoDB limits
  let reposAnnotated = 0;
  for (let i = 0; i < ops.length; i += 1000) {
    const batch = ops.slice(i, i + 1000);
    const result = await collection.bulkWrite(batch, { ordered: true });
    reposAnnotated += result.modifiedCount;
  }

  return { listsProcessed: lists.length, reposAnnotated };
}

/**
 * Get all starred repos sorted by starredAt descending
 * @param {import("mongodb").Collection} collection
 * @returns {Promise<Array>}
 */
export async function getAllStars(collection) {
  return collection
    .find({}, { projection: { _id: 0, updatedAt: 0 } })
    .sort({ starredAt: -1 })
    .toArray();
}

/**
 * Get stars added since a given date
 * @param {import("mongodb").Collection} collection
 * @param {string} since - ISO 8601 date string
 * @returns {Promise<Array>}
 */
export async function getRecentStars(collection, since) {
  return collection
    .find(
      { starredAt: { $gt: since } },
      { projection: { _id: 0, updatedAt: 0 } },
    )
    .sort({ starredAt: -1 })
    .toArray();
}

/**
 * Get total count of starred repos in cache
 * @param {import("mongodb").Collection} collection
 * @returns {Promise<number>}
 */
export async function getStarCount(collection) {
  return collection.countDocuments();
}

/**
 * Get sync state from github_sync_state collection
 * @param {import("mongodb").Db} db
 * @returns {Promise<object>}
 */
export async function getSyncState(db) {
  const stateCollection = db.collection("github_sync_state");
  const state = await stateCollection.findOne({ _id: "starred_sync" });
  return state || { lastIncrementalSync: null, lastFullSync: null };
}

/**
 * Update sync state
 * @param {import("mongodb").Db} db
 * @param {object} update - Fields to update
 */
export async function updateSyncState(db, update) {
  const stateCollection = db.collection("github_sync_state");
  await stateCollection.findOneAndUpdate(
    { _id: "starred_sync" },
    { $set: update },
    { upsert: true },
  );
}
