/**
 * Webmention blocklist MongoDB storage
 */

/**
 * Ensure indexes exist
 * @param {object} collection - MongoDB collection
 */
export async function ensureBlocklistIndexes(collection) {
  await collection.createIndex({ domain: 1 }, { unique: true });
}

/**
 * Add a domain to the blocklist
 * @param {object} collection - MongoDB collection
 * @param {string} domain - Domain to block
 * @param {string} reason - Reason ("spam", "privacy", "manual")
 * @param {number} mentionsHidden - Count of mentions hidden
 * @returns {Promise<boolean>} true if inserted, false if already existed
 */
export async function blockDomain(collection, domain, reason = "spam", mentionsHidden = 0) {
  try {
    await collection.insertOne({
      domain,
      reason,
      blockedAt: new Date().toISOString(),
      mentionsHidden,
    });
    return true;
  } catch (error) {
    // Duplicate key — domain already blocked
    if (error.code === 11000) {
      // Update reason and count
      await collection.updateOne(
        { domain },
        {
          $set: { reason },
          $inc: { mentionsHidden },
        },
      );
      return false;
    }
    throw error;
  }
}

/**
 * Remove a domain from the blocklist
 * @param {object} collection - MongoDB collection
 * @param {string} domain - Domain to unblock
 */
export async function unblockDomain(collection, domain) {
  await collection.deleteOne({ domain });
}

/**
 * Get all blocked domains
 * @param {object} collection - MongoDB collection
 * @returns {Promise<Array>}
 */
export async function getBlocklist(collection) {
  return collection.find({}).sort({ blockedAt: -1 }).toArray();
}

/**
 * Check if a domain is blocked
 * @param {object} collection - MongoDB collection
 * @param {string} domain - Domain to check
 * @returns {Promise<boolean>}
 */
export async function isDomainBlocked(collection, domain) {
  const entry = await collection.findOne({ domain });
  return !!entry;
}

/**
 * Get set of all blocked domains (for efficient sync filtering)
 * @param {object} collection - MongoDB collection
 * @returns {Promise<Set<string>>}
 */
export async function getBlockedDomainSet(collection) {
  const entries = await collection.find({}, { projection: { domain: 1 } }).toArray();
  return new Set(entries.map((e) => e.domain));
}
