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

# Ensure runtime dependency patches are applied even if node_modules already exists.
"${NODE_BIN}" scripts/patch-lightningcss.mjs
"${NODE_BIN}" scripts/patch-endpoint-media-scope.mjs
"${NODE_BIN}" scripts/patch-endpoint-media-sharp-runtime.mjs
"${NODE_BIN}" scripts/patch-frontend-sharp-runtime.mjs
"${NODE_BIN}" scripts/patch-endpoint-files-upload-route.mjs
"${NODE_BIN}" scripts/patch-endpoint-files-upload-locales.mjs
"${NODE_BIN}" scripts/patch-endpoint-activitypub-locales.mjs
"${NODE_BIN}" scripts/patch-endpoint-activitypub-docloader-loglevel.mjs
"${NODE_BIN}" scripts/patch-endpoint-activitypub-private-url-docloader.mjs
"${NODE_BIN}" scripts/patch-endpoint-activitypub-migrate-alias-clear.mjs
"${NODE_BIN}" scripts/patch-endpoint-homepage-locales.mjs
"${NODE_BIN}" scripts/patch-frontend-serviceworker-file.mjs
"${NODE_BIN}" scripts/patch-conversations-collection-guards.mjs
"${NODE_BIN}" scripts/patch-indiekit-routes-rate-limits.mjs
"${NODE_BIN}" scripts/patch-indiekit-error-production-stack.mjs
"${NODE_BIN}" scripts/patch-indieauth-devmode-guard.mjs
"${NODE_BIN}" scripts/patch-listening-endpoint-runtime-guards.mjs

# Optional: poll the webmention sender endpoint in the background.
if [ "${WEBMENTION_SENDER_AUTO_POLL:-1}" = "1" ]; then
  WEBMENTION_SENDER_HOST="${WEBMENTION_SENDER_HOST:-127.0.0.1}"
  WEBMENTION_SENDER_PORT="${WEBMENTION_SENDER_PORT:-${PORT:-3000}}"
  WEBMENTION_SENDER_PATH="${WEBMENTION_SENDER_MOUNT_PATH:-/webmention-sender}"
  WEBMENTION_SENDER_ORIGIN="${WEBMENTION_SENDER_ORIGIN:-${PUBLICATION_URL:-${SITE_URL:-}}}"
  WEBMENTION_SENDER_INTERVAL="${WEBMENTION_SENDER_POLL_INTERVAL:-300}"

  case "$WEBMENTION_SENDER_PATH" in
    /*) ;;
    *) WEBMENTION_SENDER_PATH="/$WEBMENTION_SENDER_PATH" ;;
  esac

  case "$WEBMENTION_SENDER_INTERVAL" in
    ''|*[!0-9]*) WEBMENTION_SENDER_INTERVAL=300 ;;
  esac

  WEBMENTION_SENDER_ORIGIN="${WEBMENTION_SENDER_ORIGIN%/}"

  if ! command -v curl >/dev/null 2>&1; then
    echo "[webmention] curl not found; skipping auto-send polling" >&2
  elif [ -z "$WEBMENTION_SENDER_ORIGIN" ]; then
    echo "[webmention] SITE_URL/PUBLICATION_URL missing; skipping auto-send polling" >&2
  else
    WEBMENTION_SENDER_ENDPOINT="${WEBMENTION_SENDER_ENDPOINT:-http://${WEBMENTION_SENDER_HOST}:${WEBMENTION_SENDER_PORT}${WEBMENTION_SENDER_PATH}}"

    (
      echo "[webmention] Starting auto-send polling every ${WEBMENTION_SENDER_INTERVAL}s (${WEBMENTION_SENDER_ENDPOINT})"

      while true; do
        TOKEN="$({
          WEBMENTION_ORIGIN="$WEBMENTION_SENDER_ORIGIN" \
          WEBMENTION_SECRET="$SECRET" \
          "$NODE_BIN" -e '
            const jwt = require("jsonwebtoken");
            const me = process.env.WEBMENTION_ORIGIN;
            const secret = process.env.WEBMENTION_SECRET;
            if (!me || !secret) process.exit(1);
            process.stdout.write(
              jwt.sign({ me, scope: "update" }, secret, { expiresIn: "5m" }),
            );
          ' 2>/dev/null;
        } || true)"

        if [ -n "$TOKEN" ]; then
          RESULT="$(curl -sS -X POST "${WEBMENTION_SENDER_ENDPOINT}?token=${TOKEN}" 2>&1 || true)"

          if [ -n "$RESULT" ]; then
            echo "[webmention] $(date '+%Y-%m-%d %H:%M:%S') - $RESULT"
          else
            echo "[webmention] $(date '+%Y-%m-%d %H:%M:%S') - ok"
          fi
        else
          echo "[webmention] $(date '+%Y-%m-%d %H:%M:%S') - token generation failed"
        fi

        sleep "$WEBMENTION_SENDER_INTERVAL"
      done
    ) &
  fi
fi

exec "${NODE_BIN}" node_modules/@indiekit/indiekit/bin/cli.js serve --config indiekit.config.mjs
