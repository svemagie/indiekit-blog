/**
 * Webmentions MongoDB storage
 */

import { extractDomain, ensureISOString, sanitiseHtml } from "../utils.js";

/**
 * Ensure indexes exist
 * @param {object} collection - MongoDB collection
 */
export async function ensureIndexes(collection) {
  await collection.createIndex({ wmId: 1 }, { unique: true });
  await collection.createIndex({ wmTarget: 1, hidden: 1 });
  await collection.createIndex({ sourceDomain: 1 });
  await collection.createIndex({ wmReceived: -1 });
}

/**
 * Transform a JF2 webmention entry into our storage format
 * @param {object} item - JF2 entry from webmention.io
 * @returns {object} Document for MongoDB
 */
export function jf2ToDocument(item) {
  let contentHtml = null;
  let contentText = null;

  if (item.content?.html) {
    contentHtml = sanitiseHtml(item.content.html);
  } else if (item.content?.text) {
    contentHtml = `<p>${item.content.text}</p>`;
  }

  if (item.content?.text) {
    contentText = item.content.text;
  }

  return {
    wmId: item["wm-id"],
    wmReceived: ensureISOString(item["wm-received"]) || new Date().toISOString(),
    wmProperty: item["wm-property"],
    wmTarget: item["wm-target"],
    authorName: item.author?.name || null,
    authorUrl: item.author?.url || null,
    authorPhoto: item.author?.photo || null,
    sourceUrl: item.url || null,
    sourceDomain: extractDomain(item.author?.url || item.url || ""),
    published: ensureISOString(item.published),
    contentHtml,
    contentText,
    name: item.name || null,
    hidden: false,
    hiddenAt: null,
    hiddenReason: null,
    syncedAt: new Date().toISOString(),
    raw: item,
  };
}

/**
 * Convert a stored document back to JF2 format for the public API
 * @param {object} doc - MongoDB document
 * @returns {object} JF2 entry
 */
export function documentToJf2(doc) {
  const jf2 = {
    type: "entry",
    "wm-id": doc.wmId,
    "wm-received": ensureISOString(doc.wmReceived),
    "wm-property": doc.wmProperty,
    "wm-target": doc.wmTarget,
    author: {
      type: "card",
      name: doc.authorName || "",
      url: doc.authorUrl || "",
      photo: doc.authorPhoto || "",
    },
    url: doc.sourceUrl || "",
    published: ensureISOString(doc.published) || ensureISOString(doc.wmReceived),
  };

  if (doc.name) {
    jf2.name = doc.name;
  }

  if (doc.contentHtml || doc.contentText) {
    jf2.content = {};
    if (doc.contentHtml) jf2.content.html = doc.contentHtml;
    if (doc.contentText) jf2.content.text = doc.contentText;
  }

  return jf2;
}

/**
 * Upsert a webmention into MongoDB
 * @param {object} collection - MongoDB collection
 * @param {object} item - JF2 entry
 * @returns {Promise<boolean>} true if inserted (new), false if updated
 */
export async function upsertWebmention(collection, item) {
  const doc = jf2ToDocument(item);
  const result = await collection.updateOne(
    { wmId: doc.wmId },
    {
      $setOnInsert: doc,
    },
    { upsert: true },
  );
  return result.upsertedCount > 0;
}

/**
 * Get webmentions with filters
 * @param {object} collection - MongoDB collection
 * @param {object} options - Query options
 * @returns {Promise<{items: Array, total: number}>}
 */
export async function getWebmentions(collection, options = {}) {
  const {
    target,
    wmProperty,
    showHidden = false,
    page = 0,
    perPage = 20,
  } = options;

  const query = {};

  if (!showHidden) {
    query.hidden = { $ne: true };
  }

  if (target) {
    // Match with and without trailing slash
    const targetClean = target.replace(/\/$/, "");
    query.wmTarget = { $in: [targetClean, targetClean + "/"] };
  }

  if (wmProperty) {
    query.wmProperty = wmProperty;
  }

  const total = await collection.countDocuments(query);
  const items = await collection
    .find(query)
    .sort({ wmReceived: -1 })
    .skip(page * perPage)
    .limit(perPage)
    .toArray();

  return { items, total };
}

/**
 * Get webmention counts
 * @param {object} collection - MongoDB collection
 * @returns {Promise<{total: number, hidden: number, visible: number}>}
 */
export async function getWebmentionCounts(collection) {
  const total = await collection.countDocuments({});
  const hidden = await collection.countDocuments({ hidden: true });
  return { total, hidden, visible: total - hidden };
}

/**
 * Get the highest wmId in the collection (for incremental sync)
 * @param {object} collection - MongoDB collection
 * @returns {Promise<number>} Highest wmId or 0
 */
export async function getMaxWmId(collection) {
  const result = await collection
    .find({})
    .sort({ wmId: -1 })
    .limit(1)
    .toArray();
  return result.length > 0 ? result[0].wmId : 0;
}

/**
 * Hide a webmention
 * @param {object} collection - MongoDB collection
 * @param {number} wmId - Webmention ID
 * @param {string} reason - Reason ("manual", "blocklist", "privacy")
 */
export async function hideWebmention(collection, wmId, reason = "manual") {
  await collection.updateOne(
    { wmId },
    { $set: { hidden: true, hiddenAt: new Date().toISOString(), hiddenReason: reason } },
  );
}

/**
 * Unhide a webmention
 * @param {object} collection - MongoDB collection
 * @param {number} wmId - Webmention ID
 */
export async function unhideWebmention(collection, wmId) {
  await collection.updateOne(
    { wmId },
    { $set: { hidden: false, hiddenAt: null, hiddenReason: null } },
  );
}

/**
 * Hide all webmentions from a domain
 * @param {object} collection - MongoDB collection
 * @param {string} domain - Domain to hide
 * @param {string} reason - Reason
 * @returns {Promise<number>} Number of mentions hidden
 */
export async function hideByDomain(collection, domain, reason = "blocklist") {
  const result = await collection.updateMany(
    { sourceDomain: domain, hidden: { $ne: true } },
    { $set: { hidden: true, hiddenAt: new Date().toISOString(), hiddenReason: reason } },
  );
  return result.modifiedCount;
}

/**
 * Unhide webmentions from a domain that were hidden by blocklist
 * @param {object} collection - MongoDB collection
 * @param {string} domain - Domain to unhide
 * @returns {Promise<number>} Number of mentions unhidden
 */
export async function unhideByDomain(collection, domain) {
  const result = await collection.updateMany(
    { sourceDomain: domain, hiddenReason: "blocklist" },
    { $set: { hidden: false, hiddenAt: null, hiddenReason: null } },
  );
  return result.modifiedCount;
}

/**
 * Permanently delete all webmentions from a domain (for privacy removal)
 * @param {object} collection - MongoDB collection
 * @param {string} domain - Domain
 * @returns {Promise<number>} Number deleted
 */
export async function deleteByDomain(collection, domain) {
  const result = await collection.deleteMany({ sourceDomain: domain });
  return result.deletedCount;
}

/**
 * Delete all webmentions (for full re-sync)
 * @param {object} collection - MongoDB collection
 * @returns {Promise<number>} Number deleted
 */
export async function deleteAll(collection) {
  const result = await collection.deleteMany({});
  return result.deletedCount;
}

/**
 * Get distinct source domains that have entries with missing author photos
 * @param {object} collection - MongoDB collection
 * @returns {Promise<string[]>} Array of domain strings
 */
export async function getDomainsWithMissingPhotos(collection) {
  return collection.distinct("sourceDomain", {
    authorPhoto: { $in: [null, ""] },
    sourceDomain: { $ne: null },
  });
}

/**
 * Update author photo and URL for all entries from a domain that are missing them
 * @param {object} collection - MongoDB collection
 * @param {string} domain - Source domain
 * @param {object} data - Author data to set
 * @param {string} [data.photoUrl] - Author photo URL
 * @param {string} [data.authorUrl] - Author profile URL
 * @returns {Promise<number>} Number of entries updated
 */
export async function updateAuthorDataByDomain(collection, domain, data) {
  const setFields = {};
  if (data.photoUrl) {
    setFields.authorPhoto = data.photoUrl;
  }
  if (data.authorUrl) {
    setFields.authorUrl = data.authorUrl;
  }

  if (Object.keys(setFields).length === 0) return 0;

  // Only update entries that are missing the data
  const query = { sourceDomain: domain };
  const conditions = [];
  if (data.photoUrl) {
    conditions.push({ authorPhoto: { $in: [null, ""] } });
  }
  if (data.authorUrl) {
    conditions.push({ authorUrl: { $in: [null, ""] } });
  }
  if (conditions.length > 0) {
    query.$or = conditions;
  }

  const result = await collection.updateMany(query, { $set: setFields });
  return result.modifiedCount;
}
