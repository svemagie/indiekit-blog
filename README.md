# indiekit-blog

## Admin login

- The IndieKit admin uses root auth/session paths (for example: `/session/login`, `/auth`, `/auth/new-password`).
- Login uses `PASSWORD_SECRET` (bcrypt hash), not `INDIEKIT_PASSWORD`.
- If no `PASSWORD_SECRET` exists yet, open `/auth/new-password` once to generate it.
- If login is blocked because `PASSWORD_SECRET` is missing/invalid, set `INDIEKIT_ALLOW_PASSWORD_SETUP=1` temporarily, restart, generate a new hash via `/auth/new-password`, set `PASSWORD_SECRET` to that hash, then remove `INDIEKIT_ALLOW_PASSWORD_SETUP`.
- If login appears passwordless, first check for an existing authenticated session cookie. Use `/session/logout` to force a fresh login challenge.
- Upstream IndieKit auto-authenticates in dev mode (`NODE_ENV=development`). This repository patches that behavior so dev auto-auth only works when `INDIEKIT_ALLOW_DEV_AUTH=1` is explicitly set.
- Production startup now fails closed when auth/session settings are unsafe (`NODE_ENV` not `production`, `INDIEKIT_ALLOW_DEV_AUTH=1`, weak `SECRET`, missing/invalid `PASSWORD_SECRET`, or empty-password hash).
- Post management UI should use `/posts` (`@indiekit/endpoint-posts.mountPath`).
- Do not set post-management `mountPath` to frontend routes like `/blog`, otherwise backend publishing can be shadowed by the public site.

## Backend endpoints

- Configured endpoint mount paths:
- Posts management: `/posts`
- Files: `/files`
- Webmentions moderation + API: `/webmentions`
- Conversations + API: `/conversations`
- GitHub activity + API: `/github`
- Funkwhale activity + API: `/funkwhale` (enabled when `FUNKWHALE_INSTANCE`, `FUNKWHALE_USERNAME`, `FUNKWHALE_TOKEN` are set)
- Last.fm activity + API: `/lastfmapi` (enabled when `LASTFM_API_KEY`, `LASTFM_USERNAME` are set)

## MongoDB

- Preferred: set `MONGO_USERNAME` and `MONGO_PASSWORD` explicitly; config builds the URL from `MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_HOST`, `MONGO_PORT`, `MONGO_DATABASE`, `MONGO_AUTH_SOURCE`.
- You can still use a full `MONGO_URL` (example: `mongodb://user:pass@host:27017/indiekit?authSource=admin`).
- If both `MONGO_URL` and `MONGO_USERNAME`/`MONGO_PASSWORD` are set, decomposed credentials take precedence by default to avoid stale URL mismatches. Set `MONGO_PREFER_URL=1` to force `MONGO_URL` precedence.
- Startup scripts now fail fast when `MONGO_URL` is absent and `MONGO_USERNAME` is missing, to avoid silent auth mismatches.
- Startup now runs `scripts/preflight-mongo-connection.mjs` before boot. Preflight is strict by default and aborts start on Mongo auth/connect failures; set `REQUIRE_MONGO=0` to bypass strict mode intentionally.
- For `MongoServerError: Authentication failed`, first verify `MONGO_PASSWORD`, then try `MONGO_AUTH_SOURCE=admin`.

## Content paths

- This setup writes post files to the content repo `blog` under `content/`.
- Photo upload binaries are written to `images/{filename}` and published at `${PUBLICATION_URL}/images/{filename}`.
- Current paths in `publication.postTypes` are:
- `content/articles/{slug}.md`
- `content/notes/{slug}.md`
- `content/bookmarks/{slug}.md`
- `content/likes/{slug}.md`
- `content/photos/{slug}.md`
- `content/replies/{slug}.md`
- `content/pages/{slug}.md`
- If these paths do not match the content repo structure, edit/delete actions can fail with GitHub `Not Found`.
- Reposts are handled as property-based posts (`repostOf` / `repost_of`) and rendered through the `reposts` collection in the Eleventy theme.

## Post URLs

- Current post URLs in `publication.postTypes` are:
- `https://blog.giersig.eu/articles/{slug}/`
- `https://blog.giersig.eu/notes/{slug}/`
- `https://blog.giersig.eu/bookmarks/{slug}/`
- `https://blog.giersig.eu/likes/{slug}/`
- `https://blog.giersig.eu/photos/{slug}/`
- `https://blog.giersig.eu/replies/{slug}/`
- `https://blog.giersig.eu/{slug}/` (page post type)

## GitHub tokens

- Recommended for two-repo setups:
- `GH_CONTENT_TOKEN`: token for content repo (`blog`), used by `@indiekit/store-github`.
- `GH_ACTIVITY_TOKEN`: token for GitHub dashboard/activity endpoint, used by `@rmdes/indiekit-endpoint-github`.
- `GITHUB_USERNAME`: GitHub user/owner name.
- Backward compatibility: if `GH_CONTENT_TOKEN` or `GH_ACTIVITY_TOKEN` are not set, config falls back to `GITHUB_TOKEN`.

## Listening tokens

- Funkwhale endpoint requirements:
- `FUNKWHALE_INSTANCE` (for example `https://your-funkwhale.example`)
- `FUNKWHALE_USERNAME`
- `FUNKWHALE_TOKEN` (read API token)
- Last.fm endpoint requirements:
- `LASTFM_API_KEY`
- `LASTFM_USERNAME`
- If these variables are missing, the related endpoint plugin is not enabled and `/listening` will show no listening history.

## Startup script

- `start.sh` is intentionally ignored by Git (`.gitignore`) so server secrets are not committed.
- Use `start.example.sh` as the tracked template and keep real credentials in environment variables (or `.env` on the server).
- Startup scripts parse `.env` with the `dotenv` parser (not shell `source`), so values containing spaces are handled safely.
- Startup scripts run preflight + patch helpers before boot (`scripts/preflight-production-security.mjs`, `scripts/preflight-mongo-connection.mjs`, `scripts/patch-lightningcss.mjs`, `scripts/patch-endpoint-media-scope.mjs`, `scripts/patch-endpoint-media-sharp-runtime.mjs`, `scripts/patch-frontend-sharp-runtime.mjs`, `scripts/patch-endpoint-files-upload-route.mjs`, `scripts/patch-endpoint-files-upload-locales.mjs`, `scripts/patch-frontend-serviceworker-file.mjs`, `scripts/patch-conversations-collection-guards.mjs`, `scripts/patch-indiekit-routes-rate-limits.mjs`, `scripts/patch-indiekit-error-production-stack.mjs`, `scripts/patch-indieauth-devmode-guard.mjs`).
- The production security preflight blocks startup on insecure auth/session configuration and catches empty-password bcrypt hashes.
- One-time recovery mode is available with `INDIEKIT_ALLOW_PASSWORD_SETUP=1` to bootstrap/reset `PASSWORD_SECRET` when locked out. Remove this flag after setting a valid hash.
- The media scope patch fixes a known upstream issue where file uploads can fail if the token scope is `create update delete` without explicit `media`.
- The media sharp runtime patch makes image transformation resilient on FreeBSD: if `sharp` cannot load, uploads continue without resize/rotation instead of crashing the server process.
- The frontend sharp runtime patch makes icon generation non-fatal on FreeBSD when `sharp` cannot load, preventing startup crashes in asset controller imports.
- The files upload route patch fixes browser multi-upload by posting to `/files/upload` (session-authenticated) instead of direct `/media` calls without bearer token.
- The files upload locale patch adds missing `files.upload.dropText`/`files.upload.browse`/`files.upload.submitMultiple` labels in endpoint locale files so UI text does not render raw translation keys.
- The frontend serviceworker patch ensures `@indiekit/frontend/lib/serviceworker.js` exists at runtime, forces network-only handling for `/auth` and `/session` pages, patches frontend layout templates to unregister stale service workers and clear caches on load, and suppresses sidebar rendering whenever `app--minimalui` is present.
- The conversations guard patch prevents `Cannot read properties of undefined (reading 'find')` when the `conversation_items` collection is temporarily unavailable.
- The indiekit routes rate-limit patch (ported from `rmdes/indiekit-cloudron`) keeps strict limits on `/session/*`, applies generous limits to public API/well-known routes, and removes extra rate limiting from authenticated routes to avoid admin-side 429 spikes.
- The indiekit error stack patch (ported from `rmdes/indiekit-cloudron`) suppresses stack traces in production error pages/JSON responses to avoid leaking internal runtime details.
- The indieauth dev-mode guard patch prevents accidental production auth bypass by requiring explicit `INDIEKIT_ALLOW_DEV_AUTH=1` to enable dev auto-login, and broadens safe local redirect validation to allow common path characters (`-`, `.`, `%`) used by routes such as `/auth/new-password`.
