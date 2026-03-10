#!/bin/sh
set -eu

cd /usr/local/indiekit
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
WEBMENTION_POLL_PID=""
INDIEKIT_PID=""
SHUTDOWN_IN_PROGRESS=0
WEBMENTION_STOP_TIMEOUT="${WEBMENTION_SENDER_STOP_TIMEOUT:-5}"
INDIEKIT_STOP_TIMEOUT="${INDIEKIT_STOP_TIMEOUT:-20}"
WEBMENTION_READY_TIMEOUT="${WEBMENTION_SENDER_READY_TIMEOUT:-60}"
KILL_DAEMON_PARENT_ON_SHUTDOWN="${KILL_DAEMON_PARENT_ON_SHUTDOWN:-1}"

case "$WEBMENTION_STOP_TIMEOUT" in
  ''|*[!0-9]*) WEBMENTION_STOP_TIMEOUT=5 ;;
esac

case "$INDIEKIT_STOP_TIMEOUT" in
  ''|*[!0-9]*) INDIEKIT_STOP_TIMEOUT=20 ;;
esac

case "$WEBMENTION_READY_TIMEOUT" in
  ''|*[!0-9]*) WEBMENTION_READY_TIMEOUT=60 ;;
esac

case "$KILL_DAEMON_PARENT_ON_SHUTDOWN" in
  ''|*[!0-9]*) KILL_DAEMON_PARENT_ON_SHUTDOWN=1 ;;
esac

is_pid_alive() {
  _pid="$1"

  if [ -z "$_pid" ] || ! kill -0 "$_pid" 2>/dev/null; then
    return 1
  fi

  # FreeBSD can report zombies as existing PIDs; exclude them from "alive".
  if command -v ps >/dev/null 2>&1; then
    _state="$(ps -o stat= -p "$_pid" 2>/dev/null || true)"
    case "$_state" in
      *Z*) return 1 ;;
    esac
  fi

  return 0
}

wait_for_pid_exit() {
  _pid="$1"
  _timeout="$2"
  _elapsed=0

  while is_pid_alive "$_pid"; do
    if [ "$_elapsed" -ge "$_timeout" ]; then
      return 1
    fi

    sleep 1
    _elapsed=$((_elapsed + 1))
  done

  wait "$_pid" 2>/dev/null || true
  return 0
}

stop_webmention_poller() {
  if [ -n "${WEBMENTION_POLL_PID}" ] && is_pid_alive "${WEBMENTION_POLL_PID}"; then
    kill "${WEBMENTION_POLL_PID}" 2>/dev/null || true

    if ! wait_for_pid_exit "${WEBMENTION_POLL_PID}" "${WEBMENTION_STOP_TIMEOUT}"; then
      kill -9 "${WEBMENTION_POLL_PID}" 2>/dev/null || true
      wait "${WEBMENTION_POLL_PID}" 2>/dev/null || true
    fi
  fi

  WEBMENTION_POLL_PID=""
}

stop_indiekit_server() {
  if [ -n "${INDIEKIT_PID}" ] && is_pid_alive "${INDIEKIT_PID}"; then
    kill "${INDIEKIT_PID}" 2>/dev/null || true

    if ! wait_for_pid_exit "${INDIEKIT_PID}" "${INDIEKIT_STOP_TIMEOUT}"; then
      echo "[indiekit] Shutdown timeout after ${INDIEKIT_STOP_TIMEOUT}s; forcing kill" >&2
      kill -9 "${INDIEKIT_PID}" 2>/dev/null || true
      wait "${INDIEKIT_PID}" 2>/dev/null || true
    fi
  fi

  INDIEKIT_PID=""
}

stop_daemon_parent() {
  if [ "$KILL_DAEMON_PARENT_ON_SHUTDOWN" != "1" ]; then
    return
  fi

  if ! command -v ps >/dev/null 2>&1; then
    return
  fi

  _ppid="${PPID:-}"
  if [ -z "$_ppid" ] || ! kill -0 "$_ppid" 2>/dev/null; then
    return
  fi

  _parent_cmd="$(ps -o command= -p "$_ppid" 2>/dev/null || true)"

  case "$_parent_cmd" in
    daemon:\ *\(daemon\)*|*/daemon\ *)
      kill "$_ppid" 2>/dev/null || true
      ;;
  esac
}

start_webmention_poller() {
  if [ "${WEBMENTION_SENDER_AUTO_POLL:-1}" != "1" ]; then
    return
  fi

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
    return
  fi

  if [ -z "$WEBMENTION_SENDER_ORIGIN" ]; then
    echo "[webmention] SITE_URL/PUBLICATION_URL missing; skipping auto-send polling" >&2
    return
  fi

  WEBMENTION_SENDER_ENDPOINT="${WEBMENTION_SENDER_ENDPOINT:-http://${WEBMENTION_SENDER_HOST}:${WEBMENTION_SENDER_PORT}${WEBMENTION_SENDER_PATH}}"

  # Wait for the local endpoint to answer (any HTTP status) before polling.
  WEBMENTION_READY_ELAPSED=0
  while true; do
    if ! is_pid_alive "${INDIEKIT_PID}"; then
      echo "[webmention] Indiekit exited before poller startup; skipping" >&2
      return
    fi

    WEBMENTION_READY_CODE="$(
      curl -sS -o /dev/null -m 2 -w '%{http_code}' "${WEBMENTION_SENDER_ENDPOINT}" 2>/dev/null || true
    )"

    case "$WEBMENTION_READY_CODE" in
      ''|000) ;;
      *) break ;;
    esac

    if [ "$WEBMENTION_READY_ELAPSED" -ge "$WEBMENTION_READY_TIMEOUT" ]; then
      echo "[webmention] Startup readiness timeout after ${WEBMENTION_READY_TIMEOUT}s; starting poller anyway" >&2
      break
    fi

    sleep 1
    WEBMENTION_READY_ELAPSED=$((WEBMENTION_READY_ELAPSED + 1))
  done

  (
    echo "[webmention] Starting auto-send polling every ${WEBMENTION_SENDER_INTERVAL}s (${WEBMENTION_SENDER_ENDPOINT})"

    while true; do
      if ! is_pid_alive "${INDIEKIT_PID}"; then
        echo "[webmention] Indiekit stopped; exiting poller"
        break
      fi

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

  WEBMENTION_POLL_PID="$!"
}

shutdown() {
  if [ "${SHUTDOWN_IN_PROGRESS}" = "1" ]; then
    return
  fi

  SHUTDOWN_IN_PROGRESS=1
  trap '' INT TERM HUP

  # Stop poller first so shutdown does not generate connection-refused spam.
  stop_webmention_poller
  stop_indiekit_server
  stop_daemon_parent
}

trap 'shutdown; exit 0' INT TERM HUP

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

start_webmention_poller

# Keep the parent shell responsive to TERM/HUP from rc(8)/daemon while the
# Node process runs. A blocking wait can delay trap execution on some shells.
INDIEKIT_EXIT_CODE=0

while is_pid_alive "${INDIEKIT_PID}"; do
  sleep 1
done

set +e
wait "${INDIEKIT_PID}"
INDIEKIT_EXIT_CODE="$?"
set -e

stop_webmention_poller
exit "${INDIEKIT_EXIT_CODE}"
