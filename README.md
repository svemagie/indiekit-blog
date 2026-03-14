# indiekit-blog

Personal [Indiekit](https://getindiekit.com/) deployment for [blog.giersig.eu](https://blog.giersig.eu).

Built on top of the [rmdes/indiekit](https://github.com/rmdes/indiekit) fork ecosystem. Several packages are sourced from custom forks (see below) and a set of patch scripts handle fixes that cannot yet be upstreamed.

---

## Fork-based dependencies

Three packages are installed directly from GitHub forks rather than the npm registry:

| Dependency | Source | Reason |
|---|---|---|
| `@rmdes/indiekit-endpoint-activitypub` | [svemagie/indiekit-endpoint-activitypub](https://github.com/svemagie/indiekit-endpoint-activitypub) | Alpine.js fix for reader buttons + private-address document loader for self-hosted Fedify instances |
| `@rmdes/indiekit-endpoint-blogroll` | [svemagie/indiekit-endpoint-blogroll#bookmark-import](https://github.com/svemagie/indiekit-endpoint-blogroll/tree/bookmark-import) | Bookmark import feature |
| `@rmdes/indiekit-endpoint-microsub` | [svemagie/indiekit-endpoint-microsub#bookmarks-import](https://github.com/svemagie/indiekit-endpoint-microsub/tree/bookmarks-import) | Bookmarks import feature |

In `package.json` these use the `github:owner/repo[#branch]` syntax so npm fetches them directly from GitHub on install.

---

## Patch scripts

Patches are Node.js `.mjs` scripts in `scripts/` that surgically modify files in `node_modules` after install. They are idempotent (check for a marker string before applying) and run automatically via `postinstall` and at the start of `serve`.

### ActivityPub

**`patch-endpoint-activitypub-locales.mjs`**
Injects German (`de`) locale overrides into `@rmdes/indiekit-endpoint-activitypub` (e.g. "Benachrichtigungen", "Mein Profil"). The package ships only an English locale; this copies and customises it.

### Conversations

**`patch-conversations-collection-guards.mjs`**
Adds null-safety guards to `conversation-items.js` so the endpoint does not crash when the MongoDB `conversation_items` collection is missing or empty (returns an empty cursor instead of throwing).

**`patch-conversations-mastodon-disconnect.mjs`**
Patches the conversations endpoint to handle a missing or disconnected Mastodon account gracefully — prevents startup crashes when Mastodon credentials are not configured.

### Files

**`patch-endpoint-files-upload-route.mjs`**
Fixes the file upload XHR to POST to `window.location.pathname` instead of a hardcoded endpoint path, which broke uploads behind a custom mount prefix. Also adds fallback text for missing locale keys.

**`patch-endpoint-files-upload-locales.mjs`**
Injects German locale strings for the files endpoint.

### Media

**`patch-endpoint-media-scope.mjs`**
Changes the scope check from strict equality (`scope === "create"`) to `scope.includes("create")` so tokens with compound scopes (e.g. `"create update"`) can still upload media.

**`patch-endpoint-media-sharp-runtime.mjs`**
Wraps the `sharp` import with a lazy runtime loader so the server starts even if the native `sharp` binary is missing (falls back gracefully rather than crashing at import time).

### Frontend

**`patch-frontend-sharp-runtime.mjs`**
Same lazy `sharp` runtime guard applied to `@indiekit/frontend/lib/sharp.js` (avatar/image processing). Handles multiple nested copies of the package across the dependency tree.

**`patch-frontend-serviceworker-file.mjs`**
Ensures `@indiekit/frontend/lib/serviceworker.js` exists at the path the service worker registration expects, copying it from whichever nested copy of the package is present.

**`patch-lightningcss.mjs`**
Fixes the `~module/path` resolver in `lightningcss.js` to use `require.resolve()` correctly, preventing CSS build failures when module paths contain backslashes or when package hoisting differs.

### Micropub

**`patch-endpoint-micropub-where-note-visibility.mjs`**
Defaults OwnYourSwarm `/where` check-in notes to `visibility: unlisted` unless the post explicitly sets a visibility. Prevents accidental public syndication of location check-ins.

**`patch-micropub-ai-block-resync.mjs`**
Detects stale AI-disclosure block files and re-generates them on next post save. Fixes posts that had MongoDB AI fields set but missing or empty `_ai-block.md` sidecar files (caused by a previous bug where `supportsAiDisclosure` always returned false).

### Posts

**`patch-endpoint-posts-ai-fields.mjs`**
Adds AI disclosure field UI (text level, code level, etc.) to the post creation/editing form in `@rmdes/indiekit-endpoint-posts`.

**`patch-endpoint-posts-ai-cleanup.mjs`**
Removes AI disclosure fields from the post form submission before saving, delegating persistence to the AI block sidecar system.

**`patch-endpoint-posts-uid-lookup.mjs`**
Fixes post editing 404s by adding `uid`-based lookup to the micropub source query. Without this, posts older than the first 40 results could not be opened for editing.

**`patch-endpoint-posts-prefill-url.mjs`**
Pre-fills the reference URL when creating posts from the `/news` "Post" button (`/posts/create?type=like&url=…`). The standard `postData.create` only reads `request.body`, ignoring query params.

### Preset / Eleventy

**`patch-preset-eleventy-ai-frontmatter.mjs`**
Adds AI disclosure fields (`aiTextLevel`, `aiCodeLevel`, etc.) to the Eleventy post template frontmatter so they are written into generated content files.

### Federation / Syndication

**`patch-federation-unlisted-guards.mjs`**
Prevents unlisted posts from being re-syndicated via `@indiekit/endpoint-syndicate`. The corresponding guards in `@rmdes/indiekit-endpoint-activitypub` are now built into the fork directly.

### Indiekit core

**`patch-indiekit-routes-rate-limits.mjs`**
Replaces the single blanket rate limiter with separate strict (session/auth) and relaxed (general) limiters so legitimate API traffic is not throttled during normal use.

**`patch-indiekit-error-production-stack.mjs`**
Strips stack traces from error responses in `NODE_ENV=production` to avoid leaking internal file paths to clients.

**`patch-indieauth-devmode-guard.mjs`**
Gates dev-mode auto-login behind an explicit `INDIEKIT_ALLOW_DEV_AUTH=1` env var so `devMode: true` in config does not accidentally bypass authentication in staging/production. Also widens the redirect URL regex to allow encoded characters (`%`, `.`).

### Endpoints — misc

**`patch-endpoint-homepage-locales.mjs`**
Injects German locale strings for the homepage endpoint.

**`patch-endpoint-homepage-identity-defaults.mjs`**
Sets fallback values for identity fields on the dashboard when they are not configured, preventing blank/undefined display names.

**`patch-endpoint-blogroll-feeds-alias.mjs`**
Dual-mounts the blogroll public API at both `/blogrollapi` and `/rssapi`, and adds a `/api/feeds` alias for `/api/blogs`, so existing static pages that reference different base paths all resolve correctly.

**`patch-endpoint-comments-locales.mjs`**
Injects German locale strings for the comments endpoint.

**`patch-endpoint-github-changelog-categories.mjs`**
Extends the GitHub changelog controller with additional commit category labels.

**`patch-endpoint-podroll-opml-upload.mjs`**
Adds OPML file upload support to the podroll endpoint.

### Microsub / Reader

**`patch-microsub-reader-ap-dispatch.mjs`**
Adds Fediverse/ActivityPub detection and dispatch to the Microsub reader so AP profile URLs are routed to the ActivityPub reader rather than the RSS reader.

**`patch-microsub-feed-discovery.mjs`**
Improves feed discovery in `fetchAndParseFeed`: when a bookmarked URL is an HTML page, falls back to `<link rel="alternate">` discovery and a broader set of candidate paths rather than only the fixed short list.

### Listening (Funkwhale / Last.fm)

**`patch-listening-endpoint-runtime-guards.mjs`**
Applies several guards to the listening endpoints: scopes Funkwhale history fetches to the authenticated user (`scope: "me"`) rather than the entire instance, and adds null-safety for missing credentials so the server doesn't crash when these services aren't configured.

### Webmention sender

**`patch-webmention-sender-livefetch.mjs`**
Forces the webmention sender to always fetch the live published page rather than using the stored post body. Ensures outgoing webmentions contain the full rendered HTML including all microformats.

**`patch-webmention-sender-content-scope.mjs`**
Scopes link extraction to the post content area (`.h-entry`, `<article>`, or `<main>`) when parsing a full page, preventing links in navigation and footers from generating spurious webmentions.

**`patch-webmention-sender-reset-stale.mjs`**
One-time migration (guarded by a `migrations` MongoDB collection entry) that resets posts incorrectly marked as webmention-sent with empty results because the live page was not yet deployed when the poller first fired.

---

## Preflight scripts

Run at the start of `serve` before the server starts. They fail fast with a clear message rather than letting the server start in a broken state.

| Script | Checks |
|---|---|
| `preflight-production-security.mjs` | `PASSWORD_SECRET` is set and bcrypt-hashed; blocks startup if missing in strict mode |
| `preflight-mongo-connection.mjs` | MongoDB is reachable; blocks startup if connection fails in strict mode |
| `preflight-activitypub-rsa-key.mjs` | RSA key pair for ActivityPub exists in MongoDB; generates one if absent |
| `preflight-activitypub-profile-urls.mjs` | ActivityPub actor URLs are correctly configured; warns on mismatch |

---

## Setup

```sh
npm install       # installs dependencies and runs all postinstall patches
npm run serve     # runs preflights + patches + starts the server
```

Environment variables are loaded from `.env` via `dotenv`. See `indiekit.config.mjs` for the full configuration.

---

## Changelog

### 2026-03-14

**chore: upgrade checkout and setup-node actions to v4** (`d3fb055`)
Upgraded `actions/checkout` and `actions/setup-node` from v3 to v4. Addresses the Node.js 20 deprecation warning ahead of the June 2026 forced migration to Node.js 24.

**chore: update comments-locales patch for 1.0.10 template, drop livefetch patch** (`53b40a5`)
Updated `patch-endpoint-comments-locales` to match the rewritten `comments.njk` template (Nunjucks macros + `badge()`). Removed obsolete locale keys and deleted the orphaned `patch-webmention-sender-livefetch` script.

**chore: update @indiekit/* to beta.27, bump endpoint-comments and webmention-sender** (`53bb7d3`)
- `@indiekit/indiekit`, `@indiekit/store-github`: beta.25 → beta.27
- `@rmdes/indiekit-endpoint-comments`: 1.0.0 → 1.0.10
- `@rmdes/indiekit-endpoint-webmention-sender`: 1.0.6 → 1.0.7

**fix: buffer ActivityPub body before checking for PeerTube View activities** (`314a085`)
Express's JSON body parser ignores `application/activity+json`, so `req.body` was always undefined and the PeerTube View guard never fired. Now manually buffers and parses the raw stream for `activity+json`/`ld+json` POSTs before the type check.

**chore: remove Mastodon syndicator and related patches** (`3708dd9`)
Removed the Mastodon syndicator package, config vars, patch script, and `.env` example entries. The blog is now a native ActivityPub actor.

**fix: skip PeerTube View activities before Fedify JSON-LD parse** (`296745f`)
Added an early guard in `createFedifyMiddleware` that short-circuits any POST with `body.type === "View"` and returns 200 immediately, preventing Fedify from crashing on PeerTube's non-standard View activities.

**fix: silently ignore PeerTube View activities in ActivityPub inbox** (`f004ecd`)
Added a no-op `.on(View, ...)` inbox handler to suppress noisy "Unsupported activity type" errors from PeerTube's per-watch broadcasts.

**feat: add gardenStage and ai fields to all post type presets** (`304c75f`)
- `gardenStage`: added to all post types
- `aiTextLevel`, `aiCodeLevel`, `aiTools`, `aiDescription`: extended to all content post types (bookmark, repost, photo, reply, page)

**fix: register bluesky cursor-fix patch in postinstall and serve scripts** (`3781503`)
Ensured the Bluesky cursor-fix patch runs during both `postinstall` and `serve`.

**fix: clear stale Bluesky polling cursor to restore interaction ingestion** (`655bc73`)
Cleared a stale cursor that was blocking new Bluesky interactions from being ingested.

**fix: filter out self-interactions from own Bluesky account** (`4f1440a`, `f8f595f`)
Filtered out likes, reposts, and replies from the blog's own Bluesky account to prevent self-syndication loops.

**fix: scope webmention link extraction to .h-entry not .e-content** (`b632af9`)
`u-in-reply-to`, `u-like-of`, `u-repost-of` etc. are rendered before `.e-content`, not inside it. Scoping to `.h-entry .e-content` caused them to be missed. Bumped reset-stale migration to v3 to retry affected posts.

**fix: improve microsub feed discovery via `<link rel="alternate">` tags** (`3ca9200`)
`fetchAndParseFeed` now calls `discoverFeeds()` on the fetched HTML before probing common paths, using any typed RSS/Atom/JSONFeed `<link rel="alternate">` it finds.

**fix: pre-fill reference URL when creating post from /news entry** (`0dc71d1`)
`postData.create` previously only read `request.body`, ignoring query params. Now seeds `properties` from `?url=`/`?name=` per post type: `like-of`, `bookmark-of`, `in-reply-to`, `repost-of`.

**fix: post edit 404 — query micropub source by _id not paginated scan** (`1d28df8`)
`getPostProperties` was scanning the 40 most-recent posts for a uid match, returning 404 for any older post. Fixed by patching the micropub query controller to perform a direct `findOne({ _id: getObjectId(uid) })` when `?q=source&uid=` is present.
