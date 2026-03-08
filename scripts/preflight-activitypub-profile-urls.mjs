import { MongoClient } from "mongodb";

import config from "../indiekit.config.mjs";

const strictMode = process.env.REQUIRE_MONGO !== "0";
const mongodbUrl = config.application?.mongodbUrl;
const publicationBaseUrl = (() => {
  const candidate =
    config.publication?.me ||
    process.env.PUBLICATION_URL ||
    process.env.SITE_URL ||
    "https://blog.giersig.eu";

  try {
    return new URL(candidate).href;
  } catch {
    return "https://blog.giersig.eu/";
  }
})();

function toHttpUrl(value, { baseUrl, allowRelative = false } = {}) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const absolute = new URL(trimmed);

    if (absolute.protocol === "http:" || absolute.protocol === "https:") {
      return absolute.href;
    }

    return "";
  } catch {
    if (!allowRelative) {
      return "";
    }

    try {
      const resolved = new URL(trimmed, baseUrl);

      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        return resolved.href;
      }

      return "";
    } catch {
      return "";
    }
  }
}

function readAliases(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function normalizeAliases(value, baseUrl) {
  const aliases = [];

  for (const entry of readAliases(value)) {
    // Only resolve slash-relative aliases. Non-URL handles like @user@host are dropped.
    const normalized = toHttpUrl(entry, {
      baseUrl,
      allowRelative: entry.startsWith("/"),
    });

    if (normalized && !aliases.includes(normalized)) {
      aliases.push(normalized);
    }
  }

  return aliases;
}

if (!mongodbUrl) {
  console.warn(
    "[preflight] ActivityPub profile URL sync skipped: MongoDB URL is not configured.",
  );
  process.exit(0);
}

const client = new MongoClient(mongodbUrl, { connectTimeoutMS: 5000 });

try {
  await client.connect();

  const apProfile = client.db().collection("ap_profile");
  const profile = await apProfile.findOne({});

  if (!profile) {
    console.log(
      "[preflight] ActivityPub profile URL sync skipped: no profile document found.",
    );
    process.exit(0);
  }

  const updates = {};
  const normalizedProfileUrl =
    toHttpUrl(profile.url, { baseUrl: publicationBaseUrl, allowRelative: true }) ||
    publicationBaseUrl;

  if ((profile.url || "") !== normalizedProfileUrl) {
    updates.url = normalizedProfileUrl;
  }

  const normalizedIcon = toHttpUrl(profile.icon, {
    baseUrl: publicationBaseUrl,
    allowRelative: true,
  });

  if ((profile.icon || "") !== normalizedIcon) {
    updates.icon = normalizedIcon;
  }

  const normalizedImage = toHttpUrl(profile.image, {
    baseUrl: publicationBaseUrl,
    allowRelative: true,
  });

  if ((profile.image || "") !== normalizedImage) {
    updates.image = normalizedImage;
  }

  const originalAliases = readAliases(profile.alsoKnownAs);
  const normalizedAliases = normalizeAliases(profile.alsoKnownAs, publicationBaseUrl);

  if (JSON.stringify(originalAliases) !== JSON.stringify(normalizedAliases)) {
    updates.alsoKnownAs = normalizedAliases;
  }

  const fields = Object.keys(updates);

  if (fields.length === 0) {
    console.log("[preflight] ActivityPub profile URL fields already valid");
    process.exit(0);
  }

  await apProfile.updateOne({ _id: profile._id }, { $set: updates });
  console.log(
    `[preflight] ActivityPub profile URL fields normalized: ${fields.join(", ")}`,
  );
} catch (error) {
  const message = `[preflight] ActivityPub profile URL sync failed: ${error.message}`;

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
