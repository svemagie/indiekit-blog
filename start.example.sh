#!/bin/sh
set -eu

cd /usr/local/indiekit
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"

# Optional: load environment from local .env file
# (dotenv syntax, supports spaces in values).
if [ -f .env ]; then
  eval "$("${NODE_BIN}" -e '
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
"${NODE_BIN}" scripts/preflight-production-security.mjs

# Verify MongoDB credentials/connectivity before launching server.
"${NODE_BIN}" scripts/preflight-mongo-connection.mjs

# Ensure ActivityPub has an RSA keypair for HTTP Signature delivery.
"${NODE_BIN}" scripts/preflight-activitypub-rsa-key.mjs

# Normalize ActivityPub profile URL fields (icon/image/aliases) in MongoDB.
"${NODE_BIN}" scripts/preflight-activitypub-profile-urls.mjs

for patch in scripts/patch-*.mjs; do
  echo "[startup] Applying patch: $patch"
  "${NODE_BIN}" "$patch"
done

"${NODE_BIN}" node_modules/@indiekit/indiekit/bin/cli.js serve --config indiekit.config.mjs &
INDIEKIT_PID="$!"

# Webmention sender — polls every 5 minutes (see @rmdes/indiekit-endpoint-webmention-sender README)
WEBMENTION_POLL_INTERVAL="${WEBMENTION_SENDER_POLL_INTERVAL:-300}"
INDIEKIT_LOCAL_URL="http://${INDIEKIT_BIND_HOST:-127.0.0.1}:${PORT:-3000}"
WEBMENTION_ENDPOINT="${INDIEKIT_LOCAL_URL}${WEBMENTION_SENDER_MOUNT_PATH:-/webmention-sender}"
WEBMENTION_ORIGIN="${PUBLICATION_URL:-${SITE_URL:-}}"

(
  echo "[webmention] Starting auto-send polling every ${WEBMENTION_POLL_INTERVAL}s (${WEBMENTION_ENDPOINT})"
  # Wait for indiekit to be ready before first poll (up to 2 minutes)
  _i=0
  until curl -sf "${INDIEKIT_LOCAL_URL}/status" -o /dev/null 2>&1; do
    _i=$((_i + 1))
    [ $_i -lt 60 ] || { echo "[webmention] Warning: indiekit not ready after 120s, proceeding anyway"; break; }
    sleep 2
  done
  echo "[webmention] Indiekit ready"
  while true; do
    TOKEN="$(
      WEBMENTION_ORIGIN="$WEBMENTION_ORIGIN" WEBMENTION_SECRET="$SECRET" \
      "${NODE_BIN}" -e '
        const jwt = require("jsonwebtoken");
        const me = process.env.WEBMENTION_ORIGIN;
        const secret = process.env.WEBMENTION_SECRET;
        if (!me || !secret) process.exit(1);
        process.stdout.write(jwt.sign({ me, scope: "update" }, secret, { expiresIn: "5m" }));
      ' 2>/dev/null || true
    )"

    if [ -n "$TOKEN" ]; then
      RESULT="$(curl -sS --max-time 300 -X POST -d "" "${WEBMENTION_ENDPOINT}?token=${TOKEN}" 2>&1 || true)"
      echo "[webmention] $(date '+%Y-%m-%d %H:%M:%S') - ${RESULT:-ok}"
    else
      echo "[webmention] $(date '+%Y-%m-%d %H:%M:%S') - token generation failed"
    fi

    sleep "$WEBMENTION_POLL_INTERVAL"
  done
) &
POLLER_PID="$!"

trap 'kill "${POLLER_PID}" 2>/dev/null || true' EXIT INT TERM

wait "${INDIEKIT_PID}"
