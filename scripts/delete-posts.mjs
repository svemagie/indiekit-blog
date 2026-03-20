/**
 * Delete specific posts from MongoDB by URL.
 *
 * Usage:
 *   node scripts/delete-posts.mjs
 *
 * Add --dry-run to preview without deleting.
 */

import { MongoClient } from "mongodb";
import config from "../indiekit.config.mjs";

const DRY_RUN = process.argv.includes("--dry-run");

const URLS_TO_DELETE = [
  "https://blog.giersig.eu/notes/3f6c2/",
  "https://blog.giersig.eu/notes/c60c0/",
  "https://blog.giersig.eu/notes/221cc/",
  "https://blog.giersig.eu/notes/b7efe/",
  "https://blog.giersig.eu/photos/reallohn-produktivitaet-ein-strukturelles-raetsel/",
  "https://blog.giersig.eu/replies/22d5d/",
  "https://blog.giersig.eu/notes/dff1f/",
];

// Normalise: ensure trailing slash for all URLs
const targets = URLS_TO_DELETE.map((u) => u.replace(/\/?$/, "/"));

const mongodbUrl = config.application?.mongodbUrl;
if (!mongodbUrl) {
  console.error("[delete-posts] Could not resolve MongoDB URL from config");
  process.exit(1);
}

const client = new MongoClient(mongodbUrl);

try {
  await client.connect();
  const db = client.db();
  const posts = db.collection("posts");

  for (const url of targets) {
    const doc = await posts.findOne({ "properties.url": url });

    if (!doc) {
      console.log(`[delete-posts] NOT FOUND: ${url}`);
      continue;
    }

    const type = doc.properties["post-type"] ?? doc.type ?? "unknown";
    const published = doc.properties.published ?? "(no date)";

    if (DRY_RUN) {
      console.log(`[delete-posts] DRY RUN — would delete: ${url} (${type}, ${published})`);
    } else {
      await posts.deleteOne({ _id: doc._id });
      console.log(`[delete-posts] Deleted: ${url} (${type}, ${published})`);
    }
  }
} finally {
  await client.close();
}
