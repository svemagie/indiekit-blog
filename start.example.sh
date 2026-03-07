#!/bin/sh
set -eu

cd /usr/local/indiekit

# Optional: load environment from local .env file.
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

: "${SECRET:?SECRET is required}"
: "${PASSWORD_SECRET:?PASSWORD_SECRET is required}"

# Allow either full Mongo URL or decomposed credentials.
if [ -z "${MONGO_URL:-}" ]; then
  : "${MONGO_PASSWORD:?MONGO_PASSWORD is required when MONGO_URL is not set}"
  export MONGO_USERNAME="${MONGO_USERNAME:-indiekit}"
  export MONGO_AUTH_SOURCE="${MONGO_AUTH_SOURCE:-admin}"
fi

if [ -z "${GH_CONTENT_TOKEN:-}" ] && [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GH_CONTENT_TOKEN or GITHUB_TOKEN is required" >&2
  exit 1
fi

export NODE_ENV="${NODE_ENV:-production}"

# Ensure runtime dependency patches are applied even if node_modules already exists.
/usr/local/bin/node scripts/patch-lightningcss.mjs
/usr/local/bin/node scripts/patch-endpoint-media-scope.mjs
/usr/local/bin/node scripts/patch-endpoint-files-upload-route.mjs

exec /usr/local/bin/node node_modules/@indiekit/indiekit/bin/cli.js serve --config indiekit.config.mjs
