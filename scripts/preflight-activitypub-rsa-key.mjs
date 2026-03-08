import { generateKeyPairSync } from "node:crypto";

import { MongoClient } from "mongodb";

import config from "../indiekit.config.mjs";

const strictMode = process.env.REQUIRE_MONGO !== "0";
const mongodbUrl = config.application?.mongodbUrl;

function hasPublicPem(value) {
  return (
    typeof value === "string" &&
    value.includes("-----BEGIN PUBLIC KEY-----") &&
    value.includes("-----END PUBLIC KEY-----")
  );
}

function hasPrivatePem(value) {
  return (
    typeof value === "string" &&
    value.includes("-----BEGIN PRIVATE KEY-----") &&
    value.includes("-----END PRIVATE KEY-----")
  );
}

function hasValidRsaPem(doc) {
  return hasPublicPem(doc?.publicKeyPem) && hasPrivatePem(doc?.privateKeyPem);
}

function createRsaPemPair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

if (!mongodbUrl) {
  console.warn(
    "[preflight] ActivityPub RSA key sync skipped: MongoDB URL is not configured.",
  );
  process.exit(0);
}

const client = new MongoClient(mongodbUrl, { connectTimeoutMS: 5000 });

try {
  await client.connect();

  const apKeys = client.db().collection("ap_keys");
  const now = new Date().toISOString();
  const typedRsaDoc = await apKeys.findOne({ type: "rsa" });

  if (hasValidRsaPem(typedRsaDoc)) {
    console.log("[preflight] ActivityPub RSA key pair already present");
    process.exit(0);
  }

  if (typedRsaDoc) {
    const rsaPair = createRsaPemPair();

    await apKeys.updateOne(
      { _id: typedRsaDoc._id },
      {
        $set: {
          type: "rsa",
          ...rsaPair,
          updatedAt: now,
        },
      },
    );

    console.log(
      "[preflight] Repaired ActivityPub RSA key pair in existing type='rsa' document",
    );
    process.exit(0);
  }

  const legacyPemDoc = await apKeys.findOne({
    publicKeyPem: { $exists: true },
    privateKeyPem: { $exists: true },
  });

  if (hasValidRsaPem(legacyPemDoc)) {
    if (legacyPemDoc.type !== "rsa") {
      await apKeys.updateOne(
        { _id: legacyPemDoc._id },
        {
          $set: {
            type: "rsa",
            updatedAt: now,
          },
        },
      );

      console.log("[preflight] Marked existing ActivityPub PEM key as type='rsa'");
    } else {
      console.log("[preflight] ActivityPub legacy RSA PEM key already usable");
    }

    process.exit(0);
  }

  const rsaPair = createRsaPemPair();

  await apKeys.insertOne({
    type: "rsa",
    ...rsaPair,
    createdAt: now,
  });

  console.log("[preflight] Generated and stored ActivityPub RSA key pair");
} catch (error) {
  const message = `[preflight] ActivityPub RSA key sync failed: ${error.message}`;

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
