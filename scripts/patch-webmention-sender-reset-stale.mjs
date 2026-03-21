/**
 * One-time migration: reset posts that were incorrectly marked as webmention-sent
 * with empty results because the live page was not yet deployed when the poller fired.
 *
 * Runs at startup but only executes once (guarded by a migrations collection entry).
 * After running, the patch-webmention-sender-livefetch.mjs v2 fix prevents recurrence.
 */

import { MongoClient } from "mongodb";
import config from "../indiekit.config.mjs";

const MIGRATION_ID = "webmention-sender-reset-stale-v10";

const mongodbUrl = config.application?.mongodbUrl;
if (!mongodbUrl) {
  console.log("[patch] webmention-sender-reset-stale: no MongoDB URL, skipping");
  process.exit(0);
}

const client = new MongoClient(mongodbUrl, { connectTimeoutMS: 5000 });

try {
  await client.connect();
  const db = client.db();

  // Check if this migration has already run
  const migrations = db.collection("migrations");
  const alreadyRun = await migrations.findOne({ _id: MIGRATION_ID });

  if (alreadyRun) {
    console.log("[patch] webmention-sender-reset-stale: already run, skipping");
    process.exit(0);
  }

  // Find posts marked as webmention-sent with all-zero/empty results.
  // These were silently marked by the bug (failed fetch → empty results).
  // Match both old format (counts = 0) and new v1.0.6+ format (empty arrays).
  const posts = db.collection("posts");
  const result = await posts.updateMany(
    {
      "properties.webmention-sent": true,
      $or: [
        // Old format: numeric counts all zero
        {
          "properties.webmention-results.sent": 0,
          "properties.webmention-results.failed": 0,
          "properties.webmention-results.skipped": 0,
        },
        // New format: detail arrays all empty
        {
          "properties.webmention-results.details.sent": { $size: 0 },
          "properties.webmention-results.details.failed": { $size: 0 },
          "properties.webmention-results.details.skipped": { $size: 0 },
        },
      ],
    },
    {
      $unset: {
        "properties.webmention-sent": "",
        "properties.webmention-results": "",
      },
    },
  );

  console.log(
    `[patch] webmention-sender-reset-stale: reset ${result.modifiedCount} post(s) for retry`,
  );

  // Record that this migration has run
  await migrations.insertOne({
    _id: MIGRATION_ID,
    ranAt: new Date().toISOString(),
    modifiedCount: result.modifiedCount,
  });
} catch (error) {
  console.error(`[patch] webmention-sender-reset-stale: error — ${error.message}`);
  // Non-fatal: don't block startup
} finally {
  await client.close().catch(() => {});
}
