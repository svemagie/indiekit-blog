# indiekit-blog

Personal [Indiekit](https://getindiekit.com/) deployment for [blog.giersig.eu](https://blog.giersig.eu).

Built on top of the [rmdes/indiekit](https://github.com/rmdes/indiekit) fork ecosystem. Several packages are sourced from custom forks (see below) and a set of patch scripts handle fixes that cannot yet be upstreamed.

---

## Fork-based dependencies

Four packages are installed directly from GitHub forks rather than the npm registry:

| Dependency | Source | Reason |
|---|---|---|
| `@rmdes/indiekit-endpoint-activitypub` | [svemagie/indiekit-endpoint-activitypub](https://github.com/svemagie/indiekit-endpoint-activitypub) | DM support, likes-as-bookmarks, OG images in AP objects, draft/unlisted outbox guards, merged with upstream v2.15.4 |
| `@rmdes/indiekit-endpoint-blogroll` | [svemagie/indiekit-endpoint-blogroll#bookmark-import](https://github.com/svemagie/indiekit-endpoint-blogroll/tree/bookmark-import) | Bookmark import feature |
| `@rmdes/indiekit-endpoint-microsub` | [svemagie/indiekit-endpoint-microsub#bookmarks-import](https://github.com/svemagie/indiekit-endpoint-microsub/tree/bookmarks-import) | Bookmarks import feature |
| `@rmdes/indiekit-endpoint-youtube` | [svemagie/indiekit-endpoint-youtube](https://github.com/svemagie/indiekit-endpoint-youtube) | OAuth 2.0 liked-videos sync as "like" posts |

In `package.json` these use the `github:owner/repo[#branch]` syntax so npm fetches them directly from GitHub on install.

> **Lockfile caveat:** The fork dependency is resolved to a specific commit in `package-lock.json`. When fixes are pushed to the fork, run `npm update @rmdes/indiekit-endpoint-activitypub` to pull the latest commit. The fork HEAD is at `45f8ba9` (merged upstream v2.13.0–v2.15.4 with DM support, likes-as-bookmarks, OG images in AP objects, and draft/unlisted guards).

---

## ActivityPub federation

The blog is a native ActivityPub actor (`@svemagie@blog.giersig.eu`) powered by [Fedify](https://fedify.dev/) v2.0.3 via the `@rmdes/indiekit-endpoint-activitypub` package. All federation routes are mounted at `/activitypub`.

### Actor identity

| Field | Value |
|---|---|
| Handle | `svemagie` (`AP_HANDLE` env var) |
| Actor URL | `https://blog.giersig.eu/activitypub/users/svemagie` |
| Actor type | `Person` |
| WebFinger | `acct:svemagie@blog.giersig.eu` |
| Migration alias | `https://troet.cafe/users/svemagie` (`AP_ALSO_KNOWN_AS`) |

### Key management

Two key pairs are persisted in MongoDB (`ap_keys` collection) and loaded by the key pairs dispatcher:

| Algorithm | Purpose | Storage format | Generation |
|---|---|---|---|
| RSA 2048-bit | HTTP Signatures (Mastodon/Pleroma standard) | PEM (`publicKeyPem` + `privateKeyPem`) | `preflight-activitypub-rsa-key.mjs` at startup |
| Ed25519 | Object Integrity Proofs (newer standard) | JWK (`publicKeyJwk` + `privateKeyJwk`) | Auto-generated on first use |

The RSA key is mandatory. The preflight script generates it if missing and repairs broken documents. Ed25519 is optional and fails gracefully.

### Message queue and delivery

```
Post created via Micropub
    ↓
syndicator.syndicate(properties)
    ↓
jf2ToAS2Activity() → Create/Like/Announce
    ↓
ctx.sendActivity({ identifier }, "followers", activity, {
    preferSharedInbox: true,     // batch by shared inbox
    syncCollection: true,        // FEP-8fcf collection sync
    orderingKey: postUrl,        // deduplication
})
    ↓
Redis message queue (5 parallel workers)
    ↓
Fedify signs with RSA key → HTTP POST to follower inboxes
```

**Queue backends:**

| Backend | When used | Notes |
|---|---|---|
| `RedisMessageQueue` + `ParallelMessageQueue` (5 workers) | `REDIS_URL` is set | Production: persistent, survives restarts |
| `InProcessMessageQueue` | No Redis | **Not production-safe**: queue lost on restart |

**KV store:** Redis (`RedisKvStore`) when available, otherwise MongoDB (`MongoKvStore`). Stores idempotence records, public key cache, remote document cache.

### Federation options

```javascript
createFederation({
    kv,
    queue,
    signatureTimeWindow: { hours: 12 },  // accept Mastodon retry signatures
    allowPrivateAddress: true,            // own-site resolves to 10.100.0.10
});
```

- **`signatureTimeWindow: { hours: 12 }`** — Mastodon retries failed deliveries with the original signature, which can be hours old. Without this, retries are rejected.
- **`allowPrivateAddress: true`** — blog.giersig.eu resolves to a private IP (10.100.0.10) on the home LAN. Without this, Fedify's SSRF guard blocks WebFinger and `lookupObject()` for own-site URLs, breaking federation.

### Inbox handling

Incoming activities go through `createFedifyMiddleware` → `federation.fetch()`. Registered inbox listeners:

| Activity type | Handler |
|---|---|
| Follow | Accept/store in `ap_followers` |
| Undo | Remove follow/like/announce |
| Like | Store in `ap_activities` |
| Announce | Store in `ap_activities` |
| Create | Store in `ap_activities` (notes, replies) |
| Delete | Remove referenced activity |
| Update | Update referenced activity |
| Flag | Log report |
| Move | Update follower actor URL |
| Block | Remove follower |
| View | No-op (PeerTube watch events, silently ignored) |

### Outbox and collections

| Collection | MongoDB collection | Endpoint |
|---|---|---|
| Outbox | `ap_activities` | `/activitypub/users/svemagie/outbox` |
| Followers | `ap_followers` | `/activitypub/users/svemagie/followers` |
| Following | `ap_following` | `/activitypub/users/svemagie/following` |
| Liked | `ap_interactions` | `/activitypub/users/svemagie/liked` |
| Featured | `ap_featured` | `/activitypub/users/svemagie/featured` |

### JF2 to ActivityStreams conversion

Posts are converted from Indiekit's JF2 format to ActivityStreams 2.0 in two modes:

1. **`jf2ToAS2Activity()`** — Fedify vocab objects for outbox delivery (Create wrapping Note/Article)
2. **`jf2ToActivityStreams()`** — Plain JSON-LD for content negotiation on post URLs

| Post type | Activity | Object | Notes |
|---|---|---|---|
| note | Create | Note | Plain text/HTML content |
| article | Create | Article | Has `name` (title) and optional `summary` |
| like | Create | Note | Delivered as bookmark (🔖 emoji + URL, `#bookmark` tag); same as bookmark handling |
| repost | Announce | URL | `to: Public` (upstream @rmdes addressing); content negotiation serves as Note |
| bookmark | Create | Note | Content prefixed with bookmark emoji + URL |
| reply | Create | Note | `inReplyTo` set, author CC'd and Mentioned |

**Visibility mapping:**

| Visibility | `to` | `cc` |
|---|---|---|
| public (default) | `as:Public` | followers |
| unlisted | followers | `as:Public` |
| followers | followers | _(none)_ |

**Content processing:**
- Bare URLs auto-linked via `linkifyUrls()`
- Permalink appended to content body
- Nested hashtags normalized: `on/art/music` → `#music` (Mastodon doesn't support path-style tags)
- Sensitive posts flagged with `sensitive: true`; summary doubles as CW text for notes
- Per-post OG image added to Note/Article objects (`/og/{year}-{month}-{day}-{slug}.png`) for fediverse preview cards

### Express ↔ Fedify bridge

`federation-bridge.js` converts Express requests to standard `Request` objects for Fedify:

- **Body buffering**: For `application/activity+json` POSTs, the raw stream is buffered into `req._rawBody` (original bytes) and `req.body` (parsed JSON). This is critical because `JSON.stringify(req.body)` produces different bytes than the original, breaking the `Digest` header that Fedify uses for HTTP Signature verification.
- **PeerTube View short-circuit**: If the buffered body has `type === "View"`, returns 200 immediately before Fedify's JSON-LD parser sees it (PeerTube's Schema.org extensions crash the parser).
- **Mastodon attachment fix**: `sendFedifyResponse()` ensures `attachment` is always an array (JSON-LD compaction collapses single-element arrays, breaking Mastodon's profile field display).

### AP-specific patches

These patches are applied to `node_modules` via postinstall and at serve startup. They're needed because the lockfile pins the fork to v2.10.1 which predates some fixes, and because some fixes cannot be upstreamed.

| Patch | Target | What it does |
|---|---|---|
| `patch-ap-allow-private-address` | federation-setup.js | Adds `signatureTimeWindow` and `allowPrivateAddress` to `createFederation()` |
| `patch-ap-url-lookup-api` | Adds new route | Public `GET /activitypub/api/ap-url` resolves blog URL → AP object URL |
| `patch-federation-unlisted-guards` | endpoint-syndicate | Prevents unlisted posts from being re-syndicated (AP fork has this natively) |
| `patch-endpoint-activitypub-locales` | locales | Injects German (`de`) translations for the AP endpoint UI |

### AP environment variables

| Variable | Default | Purpose |
|---|---|---|
| `AP_HANDLE` | `"svemagie"` | Actor handle (username part of `@handle@domain`) |
| `AP_ALSO_KNOWN_AS` | — | Mastodon profile URL for account migration (`alsoKnownAs`) |
| `AP_LOG_LEVEL` | `"info"` | Fedify log level: `debug` / `info` / `warning` / `error` / `fatal` |
| `AP_DEBUG` | — | Set to `1` or `true` to enable Fedify debug dashboard at `/activitypub/__debug__/` |
| `AP_DEBUG_PASSWORD` | — | Password-protect the debug dashboard |
| `REDIS_URL` | — | Redis connection string for message queue + KV store |

### Troubleshooting

**`ERR fedify·federation·inbox Failed to verify the request's HTTP Signatures`**
The body buffering patch must preserve raw bytes in `req._rawBody`. If `JSON.stringify(req.body)` is used instead, the Digest header won't match. Check that `patch-inbox-skip-view-activity-parse` applied correctly.

**Activities appear in outbox but Mastodon doesn't receive them**
1. Check Redis connectivity: `redis-cli -h 10.100.0.20 ping`
2. Look for `[ActivityPub] Using Redis message queue` in startup logs
3. Set `AP_LOG_LEVEL=debug` to see Fedify delivery attempts
4. Verify `allowPrivateAddress: true` is in `createFederation()` — without it, Fedify blocks own-site URL resolution

**Patch chain dependency**: `patch-ap-allow-private-address` adds both `signatureTimeWindow` and `allowPrivateAddress`. It handles both fresh v2.10.1 (no prior patches) and already-patched files. If it logs "snippet not found — skipping", the base code structure has changed and the patch needs updating.

---

## Outgoing webmentions

The blog sends [webmentions](https://www.w3.org/TR/webmention/) to every external URL found in a published post. This is handled by the `@rmdes/indiekit-endpoint-webmention-sender` plugin, extended by several patches and a shell-based poller.

### How it works

```
Post created via Micropub → saved to MongoDB
    ↓
Shell poller (every 300s) POSTs to /webmention-sender?token=JWT
    ↓
Plugin queries MongoDB for posts with webmention-sent != true
    ↓
For each unsent post:
  1. Fetch the live HTML page (not stored content)
  2. Parse with microformats — scope to .h-entry
  3. Extract all <a href="…"> links
  4. Filter to external links only
  5. For each link: discover webmention endpoint via <link> / HTTP header
  6. Send webmention (source=postUrl, target=linkUrl)
  7. Mark post as webmention-sent with results {sent, failed, skipped}
```

### Why live-fetch instead of stored content

Post content stored in MongoDB (`post.properties.content.html`) is just the post body text. It does **not** contain the microformat links rendered by the Eleventy templates:

- `u-in-reply-to` — rendered by `reply-context.njk` inside the `.h-entry` wrapper
- `u-like-of` — same template
- `u-repost-of` — same template
- `u-bookmark-of` — same template

These links only exist in the live HTML page, so the webmention sender must always fetch the rendered page to discover them. This is what `patch-webmention-sender-livefetch.mjs` does.

### Poller architecture (start.sh)

The webmention sender plugin does not have its own scheduling — it exposes an HTTP endpoint that triggers a scan when POSTed to. The `start.sh` script runs a background shell loop:

1. **Readiness check** — polls `GET /webmention-sender/api/status` every 2s until it returns 200 (up to 3 minutes). This ensures MongoDB collections and plugin routes are fully initialised before the first scan.
2. **JWT generation** — mints a short-lived token (`{ me, scope: "update" }`, 5-minute expiry) signed with `SECRET`.
3. **POST trigger** — `curl -X POST /webmention-sender?token=JWT` triggers one scan cycle.
4. **Sleep** — waits `WEBMENTION_SENDER_POLL_INTERVAL` seconds (default 300 = 5 minutes), then repeats.

The poller routes through nginx (`INTERNAL_FETCH_URL`) rather than hitting Indiekit directly, so the request arrives with correct `Host` and `X-Forwarded-Proto` headers.

### Internal URL rewriting

When the livefetch patch fetches a post's live page, it rewrites the URL from the public domain to the internal nginx address:

```
https://blog.giersig.eu/replies/693e6/
    ↓ rewrite via INTERNAL_FETCH_URL
http://10.100.0.10/replies/693e6/
    ↓ nginx proxies to Indiekit
http://10.100.0.20:3000/replies/693e6/
```

Without this, the node jail cannot reach its own public HTTPS URL (TLS terminates on the web jail). The fallback chain is:

1. `INTERNAL_FETCH_URL` environment variable (production: `http://10.100.0.10`)
2. `http://localhost:${PORT}` (development)

### Retry behaviour

If the live page fetch fails (e.g. deploy still in progress, 502 from nginx), the post is **not** marked as sent. It stays in the "unsent" queue and is retried on the next poll cycle. This prevents the original upstream bug where a failed fetch would permanently mark the post as sent with zero webmentions.

### Patches

| Patch | Purpose |
|---|---|
| `patch-webmention-sender-livefetch.mjs` | Always fetch live HTML instead of stored content; rewrite URL for jailed setups; skip (don't mark sent) on fetch failure |
| `patch-webmention-sender-retry.mjs` | Predecessor to livefetch — only fixed the fetch-failure path. Now a no-op because livefetch runs first and is a superset. Kept for safety in case livefetch fails to apply. |
| `patch-webmention-sender-reset-stale.mjs` | One-time MongoDB migration: resets posts incorrectly marked as sent with 0/0/0 results. Guarded by `migrations` collection (`webmention-sender-reset-stale-v8`). |
| `patch-webmention-sender-empty-details.mjs` | UI patch: shows "No external links discovered" in the dashboard when a post was processed but had no outbound links (instead of a blank row). |

### Patch ordering

Patches run alphabetically via `for patch in scripts/patch-*.mjs`. For webmention patches:

1. `patch-webmention-sender-empty-details.mjs` — targets the `.njk` template (independent)
2. `patch-webmention-sender-livefetch.mjs` — replaces the fetch block in `webmention-sender.js`
3. `patch-webmention-sender-reset-stale.mjs` — MongoDB migration (independent)
4. `patch-webmention-sender-retry.mjs` — targets the same fetch block, but it's already gone (livefetch replaced it), so it reports "already applied" and skips

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `WEBMENTION_SENDER_POLL_INTERVAL` | `300` | Seconds between poll cycles |
| `WEBMENTION_SENDER_MOUNT_PATH` | `/webmention-sender` | Plugin mount path in Express |
| `WEBMENTION_SENDER_TIMEOUT` | `10000` | Per-endpoint send timeout (ms) |
| `WEBMENTION_SENDER_USER_AGENT` | `"Indiekit Webmention Sender"` | User-Agent for outgoing requests |
| `INTERNAL_FETCH_URL` | — | Internal nginx URL for self-fetches (e.g. `http://10.100.0.10`) |
| `SECRET` | _(required)_ | JWT signing secret for poller authentication |

### Troubleshooting

**"No external links discovered in this post"**
The live page was fetched successfully but no `<a href>` tags with external URLs were found inside the `.h-entry`. Check that the post's Eleventy template renders the microformat links (`u-like-of`, etc.) correctly.

**502 Bad Gateway on first poll**
The readiness check (`/webmention-sender/api/status`) should prevent this. If it still happens, the plugin may have registered its routes but MongoDB isn't ready yet. Increase the readiness timeout or check MongoDB connectivity.

**Posts stuck as "not sent" / retrying every cycle**
The live page fetch is failing every time. Check:
1. `INTERNAL_FETCH_URL` is set and nginx port 80 is reachable from the node jail
2. nginx port 80 has `proxy_set_header X-Forwarded-Proto https` (prevents redirect loop)
3. The post URL actually resolves to a page (not a 404)

**Previously failed posts not retrying**
Run the stale-reset migration: `node scripts/patch-webmention-sender-reset-stale.mjs`. It resets all posts marked as sent with 0/0/0 results. It's idempotent (guarded by a migration ID in MongoDB).

---

## YouTube likes sync

The blog syncs YouTube liked videos as IndieWeb "like" posts. Powered by the forked `@rmdes/indiekit-endpoint-youtube` with an added OAuth 2.0 flow.

### How it works

```
First sync after connecting:
  YouTube API → fetch all liked video IDs → store in youtubeLikesSeen collection
  (no posts created — baseline snapshot only)

Every subsequent sync (hourly background + manual trigger):
  YouTube API → fetch liked videos → compare against youtubeLikesSeen
    ↓ new like found (not in seen set)
  Mark as seen → generate markdown via publication.postTemplate()
    → write file to GitHub store via store.createFile()
    → insert post document into MongoDB posts collection
    ↓ already seen
  Skip
```

Only likes added **after** the initial connection produce posts. Existing likes (e.g. 200 historical ones) are baselined without generating posts.

Like posts are created as **drafts** (`post-status: draft` → `draft: true` in Eleventy frontmatter) with content `Video Title - Channel Name`. The markdown file is committed to the GitHub `blog` repo via `@indiekit/store-github`, following the same flow as Micropub-created posts (postTemplate → store.createFile). Reset also deletes files from the store.

### OAuth 2.0 setup

The YouTube Data API requires OAuth 2.0 (not just an API key) to access a user's liked videos.

1. Create an **OAuth 2.0 Client ID** (Web application) in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add authorized redirect URI: `https://blog.giersig.eu/youtube/likes/callback`
3. Ensure **YouTube Data API v3** is enabled for the project
4. Set environment variables:

| Variable | Description |
|---|---|
| `YOUTUBE_OAUTH_CLIENT_ID` | OAuth 2.0 client ID |
| `YOUTUBE_OAUTH_CLIENT_SECRET` | OAuth 2.0 client secret |

> **Brand Account caveat:** If your YouTube channel runs under a Brand Account, you must authorize the Brand Account (not your personal Google account) during the OAuth consent screen. The `myRating=like` API call only returns likes for the authenticated account. If you see "account is closed", you selected the wrong account.

### Routes

| Route | Auth | Description |
|---|---|---|
| `GET /youtube/likes` | Yes | Dashboard: OAuth status, sync info, controls |
| `GET /youtube/likes/connect` | Yes | Starts OAuth flow (redirects to Google) |
| `GET /youtube/likes/callback` | No | OAuth callback (Google redirects here) |
| `POST /youtube/likes/disconnect` | Yes | Removes stored tokens |
| `POST /youtube/likes/sync` | Yes | Triggers manual sync |
| `POST /youtube/likes/reset` | Yes | Deletes all like posts (GitHub + MongoDB), seen IDs, baseline |
| `GET /youtube/api/likes` | No | Public JSON API (`?limit=N&offset=N`) |

### MongoDB collections

| Collection | Purpose |
|---|---|
| `youtubeMeta` | OAuth tokens (`key: "oauth_tokens"`), sync status (`key: "likes_sync"`), baseline flag (`key: "likes_baseline"`) |
| `youtubeLikesSeen` | Set of all video IDs seen so far (indexed on `videoId`, unique). Prevents duplicate post creation and ensures only new likes after baseline produce posts. |

### Configuration

```javascript
"@rmdes/indiekit-endpoint-youtube": {
  oauth: {
    clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
  },
  likes: {
    syncInterval: 3_600_000,  // 1 hour (default)
    maxPages: 3,              // 50 likes/page → up to 150 per sync
    autoSync: true,           // background periodic sync
  },
},
```

### Quota usage

`videos.list?myRating=like` costs **1 quota unit per page** (50 videos). With defaults (3 pages/sync, hourly): ~72 units/day out of the 10,000 daily quota.

---

## Patch scripts

Patches are Node.js `.mjs` scripts in `scripts/` that surgically modify files in `node_modules` after install. They are idempotent (check for a marker string before applying) and run automatically via `postinstall` and at the start of `serve`.

### ActivityPub

> See also the [ActivityPub federation](#activitypub-federation) section above for a full architecture overview.

**`patch-ap-allow-private-address.mjs`**
Adds `signatureTimeWindow: { hours: 12 }` and `allowPrivateAddress: true` to `createFederation()`. Handles both fresh v2.10.1 and already-patched files. Without this, Fedify rejects Mastodon retry signatures and blocks own-site URL resolution on the private LAN.

**`patch-ap-url-lookup-api.mjs`**
Adds a public `GET /activitypub/api/ap-url?url=` endpoint that resolves a blog post URL to its canonical Fedify-served AP object URL. Used by the "Also on fediverse" widget for `authorize_interaction`.

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

// **`patch-microsub-reader-ap-dispatch.mjs`**
Adds Fediverse/ActivityPub detection and dispatch to the Microsub reader so AP profile URLs are routed to the ActivityPub reader rather than the RSS reader.

**`patch-microsub-feed-discovery.mjs`**
Improves feed discovery in `fetchAndParseFeed`: when a bookmarked URL is an HTML page, falls back to `<link rel="alternate">` discovery and a broader set of candidate paths rather than only the fixed short list.

### Listening (Funkwhale / Last.fm)

**`patch-listening-endpoint-runtime-guards.mjs`**
Applies several guards to the listening endpoints: scopes Funkwhale history fetches to the authenticated user (`scope: "me"`) rather than the entire instance, and adds null-safety for missing credentials so the server doesn't crash when these services aren't configured.

### Webmention sender

**`patch-webmention-sender-livefetch.mjs`**
Forces the webmention sender to always fetch the live published page rather than using the stored post body. Ensures outgoing webmentions contain the full rendered HTML including all microformats. Rewrites the fetch URL via `INTERNAL_FETCH_URL` for jailed setups.

**`patch-webmention-sender-reset-stale.mjs`**
One-time migration (guarded by a `migrations` MongoDB collection entry) that resets posts incorrectly marked as webmention-sent with empty results because the live page was not yet deployed when the poller first fired.

### Bluesky syndicator

**`patch-bluesky-syndicator-internal-url.mjs`**
Rewrites own-domain fetch URLs in the Bluesky syndicator to `INTERNAL_FETCH_URL` for jailed setups. Covers `uploadMedia()` (photo uploads), `uploadImageFromUrl()` (OG image thumbnails), and `fetchOpenGraphData()` (OG metadata extraction).

### Internal URL rewriting

**`patch-micropub-fetch-internal-url.mjs`**
Rewrites self-referential fetch URLs to `INTERNAL_FETCH_URL` (or `http://localhost:PORT`) across multiple endpoints: endpoint-syndicate, endpoint-share, microsub reader, activitypub compose, endpoint-posts, indieauth token exchange, token introspection, and media uploads. Required for jailed setups where the server cannot reach its own public HTTPS URL.

**`patch-syndicate-force-checked-default.mjs`**
When force-syndicating a post with no `mp-syndicate-to` and no existing syndication URLs, falls back to targets with `checked: true` instead of doing nothing.

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

## Server architecture

The production setup uses two FreeBSD jails managed by [Bastille](https://bastillebsd.org/):

```
                    ┌─────────────────────────────────────────┐
  Internet ──▶ 443 │  web jail (10.100.0.10)                 │
                    │  nginx — terminates TLS                 │
                    │  • static files (Eleventy _site output) │
                    │  • proxy_pass dynamic → node jail :3000 │
                    │  • port 80 for internal fetches (no TLS)│
                    └───────────────┬─────────────────────────┘
                                    │ http://10.100.0.20:3000
                    ┌───────────────▼─────────────────────────┐
                    │  node jail (10.100.0.20)                │
                    │  Indiekit (Express on port 3000)        │
                    │  MongoDB (localhost or separate jail)    │
                    └─────────────────────────────────────────┘
```

### Internal fetch URL

The node jail cannot reach the public HTTPS URL (`https://blog.giersig.eu`) because TLS terminates on the web jail. Several features need to fetch their own pages or static assets:

- **Webmention sender** — fetches live page HTML for link extraction
- **Bluesky syndicator** — fetches photos for upload, OG metadata/images for link cards
- **Micropub/syndicate** — self-fetches for token introspection, post updates

All of these use a shared `_toInternalUrl()` helper (injected by patch scripts) that rewrites the public base URL to `INTERNAL_FETCH_URL`. This should point to the nginx web jail's **HTTP** (port 80) listener, which serves both static files and proxies dynamic routes to Indiekit — without TLS.

```
INTERNAL_FETCH_URL=http://10.100.0.10
```

### nginx port 80 configuration

The internal HTTP listener must:

1. **Serve content directly** (not redirect to HTTPS)
2. **Set `X-Forwarded-Proto: https`** so Indiekit's `force-https` middleware does not redirect internal requests back to HTTPS
3. Proxy dynamic routes to the node jail, serve static files from the Eleventy build output

```nginx
# Internal HTTP listener — used by Indiekit for self-fetches.
# Not exposed to the internet (firewall blocks external port 80).
server {
    listen 10.100.0.10:80;
    server_name blog.giersig.eu;

    # Tell Indiekit this is the real domain (not 10.100.0.10) and
    # that TLS was terminated upstream so force-https doesn't redirect.
    proxy_set_header Host blog.giersig.eu;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # Static files from Eleventy build (rsynced to /usr/local/www/blog)
    location /images/ { root /usr/local/www/blog; }
    location /og/     { root /usr/local/www/blog; }

    # Everything else → Indiekit
    location / {
        proxy_pass http://10.100.0.20:3000;
    }
}
```

### Key environment variables (node jail `.env`)

| Variable | Example | Purpose |
|---|---|---|
| `INTERNAL_FETCH_URL` | `http://10.100.0.10` | nginx HTTP endpoint for self-fetches |
| `INDIEKIT_BIND_HOST` | `10.100.0.20` | Jail IP (loopback unavailable in jails); used by webmention poller |
| `PORT` | `3000` | Indiekit listen port (default 3000) |

---

## Setup

```sh
npm install       # installs dependencies and runs all postinstall patches
npm run serve     # runs preflights + patches + starts the server
```

Environment variables are loaded from `.env` via `dotenv`. See `indiekit.config.mjs` for the full configuration.

---

## Changelog

### 2026-03-19

**feat: deliver likes as bookmarks, revert announce cc, add OG images** (`45f8ba9` in svemagie/indiekit-endpoint-activitypub)
Likes are now sent as Create/Note with bookmark-style content (🔖 emoji + URL + `#bookmark` tag) instead of Like activities — ensures proper display on Mastodon. Announce activities reverted to upstream @rmdes addressing (`to: Public` only, no `cc: followers`). Both plain JSON-LD and Fedify Note/Article objects now include a per-post OG image derived from the post URL pattern. Removed unused `patch-ap-like-announce-addressing.mjs`.

**feat: add soft-delete filter and content-warning support to blog theme** (`d9ac9bf` in svemagie/blog)
Posts with `deleted: true` are now excluded from all Eleventy collections (supports AP soft-delete). Posts with `contentWarning`/`content_warning` frontmatter show a collapsible warning on post pages and a warning label (hiding content + photos) on listing pages.

**chore: merge upstream rmdes:main v2.13.0–v2.15.4 into fork** (`b99f5fb`)
Merged 15 upstream commits adding: manual follow approval, custom emoji, FEP-8fcf/fe34 compliance (v2.13.0), server blocking, Redis caching, key refresh, async inbox queue (v2.14.0), outbox failure handling with strike system, reply chain forwarding, reply intelligence in reader (v2.15.0–v2.15.4), CW `content-warning` property, soft-delete filtering, `as:Endpoints` type stripping. Preserved our DM compose path, Like/Announce addressing, draft/unlisted outbox guards.

**chore: remove 5 obsolete AP patches** — `patch-ap-object-url-trailing-slash`, `patch-ap-normalize-nested-tags`, `patch-ap-like-announce-addressing`, `patch-inbox-skip-view-activity-parse`, `patch-inbox-ignore-view-activity` are now baked into the fork source.

**fix: update patch-ap-allow-private-address for v2.15 comment style** — The upstream `createFederation` block changed its comment format; updated the patch to match.

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
