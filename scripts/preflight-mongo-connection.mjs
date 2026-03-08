import { MongoClient } from "mongodb";

import config from "../indiekit.config.mjs";

const strictMode = process.env.REQUIRE_MONGO !== "0";

const hasMongoUrl = Boolean(process.env.MONGO_URL);
const mongoUser = process.env.MONGO_USERNAME || process.env.MONGO_USER || "";
const hasMongoPassword = Boolean(process.env.MONGO_PASSWORD);

if (!hasMongoUrl && (!mongoUser || !hasMongoPassword)) {
  const message =
    "[preflight] Missing Mongo credentials: set MONGO_URL or MONGO_USERNAME + MONGO_PASSWORD.";

  if (strictMode) {
    console.error(message);
    process.exit(1);
  }

  console.warn(`${message} Continuing because strict mode is disabled.`);
  process.exit(0);
}

const mongodbUrl = config.application?.mongodbUrl;

if (!mongodbUrl) {
  const message = "[preflight] MongoDB URL could not be resolved from configuration.";

  if (strictMode) {
    console.error(message);
    process.exit(1);
  }

  console.warn(`${message} Continuing because strict mode is disabled.`);
  process.exit(0);
}

try {
  const parsedUrl = new URL(mongodbUrl);
  const database = parsedUrl.pathname.replace(/^\//, "") || "(default)";
  const authSource = parsedUrl.searchParams.get("authSource") || "(default)";
  const username = parsedUrl.username ? decodeURIComponent(parsedUrl.username) : "(none)";

  console.log(
    `[preflight] Mongo target ${parsedUrl.hostname}:${parsedUrl.port || "27017"}/${database} user=${username} authSource=${authSource}`,
  );
} catch {
  // Keep preflight behavior unchanged if URL parsing fails.
}

const client = new MongoClient(mongodbUrl, { connectTimeoutMS: 5000 });

try {
  await client.connect();
  await client.db().command({ ping: 1 });
  console.log("[preflight] MongoDB connection OK");
} catch (error) {
  const message = `[preflight] MongoDB connection failed: ${error.message}`;

  if (hasMongoUrl && mongoUser && hasMongoPassword) {
    console.warn(
      "[preflight] Both MONGO_URL and MONGO_USERNAME/MONGO_PASSWORD are set. Effective precedence follows indiekit.config.mjs.",
    );
  }

  if (strictMode) {
    console.error(message);
    process.exit(1);
  }

  console.warn(`${message} Continuing because strict mode is disabled.`);
} finally {
  try {
    await client.close();
  } catch {
    // no-op
  }
}
