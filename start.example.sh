#!/bin/sh
set -eu

cd /usr/local/indiekit

# Optional: load environment from local .env file
# (dotenv syntax, supports spaces in values).
if [ -f .env ]; then
  eval "$(${NODE_BIN:-/usr/local/bin/node} -e '
    const fs = require("node:fs");
    const dotenv = require("dotenv");
    const parsed = dotenv.parse(fs.readFileSync(".env"));
    for (const [key, value] of Object.entries(parsed)) {
      const safe = String(value).split("\x27").join("\x27\"\x27\"\x27");
      process.stdout.write(`export ${key}=\x27${safe}\x27\n`);
    }
  ')"
fi

: "${SECRET:?SECRET is required}"
if [ "${INDIEKIT_ALLOW_PASSWORD_SETUP:-0}" != "1" ]; then
  : "${PASSWORD_SECRET:?PASSWORD_SECRET is required}"
fi

# Allow either full Mongo URL or decomposed credentials.
if [ -z "${MONGO_URL:-}" ]; then
  : "${MONGO_USERNAME:?MONGO_USERNAME is required when MONGO_URL is not set}"
  : "${MONGO_PASSWORD:?MONGO_PASSWORD is required when MONGO_URL is not set}"
  export MONGO_AUTH_SOURCE="${MONGO_AUTH_SOURCE:-admin}"
fi

if [ -z "${GH_CONTENT_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GH_CONTENT_TOKEN or GITHUB_TOKEN is required" >&2
  exit 1
fi

# Force production runtime and keep debug logging disabled.
export NODE_ENV="production"
export INDIEKIT_DEBUG="0"
unset DEBUG

# Verify production auth/session hardening before launching server.
/usr/local/bin/node scripts/preflight-production-security.mjs

# Verify MongoDB credentials/connectivity before launching server.
/usr/local/bin/node scripts/preflight-mongo-connection.mjs

# Ensure ActivityPub has an RSA keypair for HTTP Signature delivery.
/usr/local/bin/node scripts/preflight-activitypub-rsa-key.mjs

# Normalize ActivityPub profile URL fields (icon/image/aliases) in MongoDB.
/usr/local/bin/node scripts/preflight-activitypub-profile-urls.mjs

# Ensure runtime dependency patches are applied even if node_modules already exists.
/usr/local/bin/node scripts/patch-lightningcss.mjs
/usr/local/bin/node scripts/patch-endpoint-media-scope.mjs
/usr/local/bin/node scripts/patch-endpoint-media-sharp-runtime.mjs
/usr/local/bin/node scripts/patch-frontend-sharp-runtime.mjs
/usr/local/bin/node scripts/patch-endpoint-files-upload-route.mjs
/usr/local/bin/node scripts/patch-endpoint-files-upload-locales.mjs
/usr/local/bin/node scripts/patch-endpoint-activitypub-locales.mjs
/usr/local/bin/node scripts/patch-endpoint-homepage-locales.mjs
/usr/local/bin/node scripts/patch-frontend-serviceworker-file.mjs
/usr/local/bin/node scripts/patch-conversations-collection-guards.mjs
/usr/local/bin/node scripts/patch-indiekit-routes-rate-limits.mjs
/usr/local/bin/node scripts/patch-indiekit-error-production-stack.mjs
/usr/local/bin/node scripts/patch-indieauth-devmode-guard.mjs
/usr/local/bin/node scripts/patch-listening-endpoint-runtime-guards.mjs

exec /usr/local/bin/node node_modules/@indiekit/indiekit/bin/cli.js serve --config indiekit.config.mjs
