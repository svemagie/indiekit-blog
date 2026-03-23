# indiekit-blog

Personal [Indiekit](https://getindiekit.com/) deployment for [blog.giersig.eu](https://blog.giersig.eu).

Built on top of the [rmdes/indiekit](https://github.com/rmdes/indiekit) fork ecosystem. Several packages are sourced from custom forks (see below) and a set of patch scripts handle fixes that cannot yet be upstreamed.

---

## Fork-based dependencies

Four packages are installed directly from GitHub forks rather than the npm registry:

| Dependency | Source | Reason |
|---|---|---|
| `@rmdes/indiekit-endpoint-activitypub` | [svemagie/indiekit-endpoint-activitypub](https://github.com/svemagie/indiekit-endpoint-activitypub) | DM support, likes-as-bookmarks, OG images in AP objects, draft/unlisted outbox guards, merged with upstream post-3.8.1 |
| `@rmdes/indiekit-endpoint-blogroll` | [svemagie/indiekit-endpoint-blogroll#bookmark-import](https://github.com/svemagie/indiekit-endpoint-blogroll/tree/bookmark-import) | Bookmark import feature |
| `@rmdes/indiekit-endpoint-microsub` | [svemagie/indiekit-endpoint-microsub#bookmarks-import](https://github.com/svemagie/indiekit-endpoint-microsub/tree/bookmarks-import) | Bookmarks import feature |
| `@rmdes/indiekit-endpoint-youtube` | [svemagie/indiekit-endpoint-youtube](https://github.com/svemagie/indiekit-endpoint-youtube) | OAuth 2.0 liked-videos sync as "like" posts |

In `package.json` these use the `github:owner/repo[#branch]` syntax so npm fetches them directly from GitHub on install.

> **Lockfile caveat:** The fork dependency is resolved to a specific commit in `package-lock.json`. When fixes are pushed to the fork, run `npm update @rmdes/indiekit-endpoint-activitypub` to pull the latest commit. The fork HEAD is at `ed18446` (synced with upstream post-3.8.1: tags.pub hashtag discovery, AP JSON content negotiation fix, RSA Multikey removal, direct follow workaround for tags.pub identity/v1 context rejection; merge artifacts removed; DM from Mastodon client no longer creates public blog post; remote profile resolution uses lookupWithSecurity with timeouts).

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
- Per-post OG image added to Note/Article objects (`/og/{slug}.png`) for fediverse preview cards

### Express ↔ Fedify bridge

`federation-bridge.js` converts Express requests to standard `Request` objects for Fedify:

- **Body buffering**: For `application/activity+json` POSTs, the raw stream is buffered into `req._rawBody` (original bytes) and `req.body` (parsed JSON). This is critical because `JSON.stringify(req.body)` produces different bytes than the original, breaking the `Digest` header that Fedify uses for HTTP Signature verification.
- **PeerTube View short-circuit**: If the buffered body has `type === "View"`, returns 200 immediately before Fedify's JSON-LD parser sees it (PeerTube's Schema.org extensions crash the parser).
- **Mastodon attachment fix**: `sendFedifyResponse()` ensures `attachment` is always an array (JSON-LD compaction collapses single-element arrays, breaking Mastodon's profile field display).

### AP-specific patches

These patches are applied to `node_modules` via postinstall and at serve startup. They're needed because some fixes cannot be upstreamed or because they adapt upstream behaviour to this blog's specific URL structure.

| Patch | Target | What it does |
|---|---|---|
| `patch-ap-allow-private-address` | federation-setup.js | Adds `signatureTimeWindow` and `allowPrivateAddress` to `createFederation()` |
| `patch-ap-url-lookup-api` | Adds new route | Public `GET /activitypub/api/ap-url` resolves blog URL → AP object URL |
| `patch-ap-og-image` | jf2-to-as2.js | Fixes OG image URL generation — see below |
| `patch-federation-unlisted-guards` | endpoint-syndicate | Prevents unlisted posts from being re-syndicated (AP fork has this natively) |
| `patch-endpoint-activitypub-locales` | locales | Injects German (`de`) translations for the AP endpoint UI |

**`patch-ap-og-image.mjs`**
The fork (both 842fc5af and 45f8ba9) attempts to derive the OG image path by matching a date-based URL pattern like `/articles/2024/01/15/slug/`. This blog uses flat URLs (`/articles/slug/`) with no date component, so the regex never matches and no `image` property is set on ActivityPub objects — Mastodon and other clients never show a preview card.

The patch replaces the broken date-from-URL regex with a simple last-path-segment extraction, producing `/og/{slug}.png` — the actual filename the Eleventy build generates (e.g. `/og/2615b.png`). Applied to both `jf2ToActivityStreams()` (plain JSON-LD) and `jf2ToAS2Activity()` (Fedify vocab objects).

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
| `patch-webmention-sender-livefetch.mjs` | **(v2)** Always fetch live HTML; validate it contains `h-entry` (rejects error pages/502s); skip without marking sent on any failure; rewrites URL via `INTERNAL_FETCH_URL` for jailed setups. Upgrades from v1 in-place. |
| `patch-webmention-sender-retry.mjs` | Predecessor to livefetch — superseded by livefetch v2. Silently skips when livefetch v2 marker is present; logs "already applied" otherwise. Kept so it doesn't error if livefetch fails to apply. |
| `patch-webmention-sender-reset-stale.mjs` | One-time MongoDB migration (v9): resets posts incorrectly marked as sent with empty results. Matches both old numeric-zero format and new v1.0.6+ empty-array format. Guarded by `migrations` collection (`webmention-sender-reset-stale-v9`). |
| `patch-webmention-sender-empty-details.mjs` | UI patch: shows "No external links discovered" in the dashboard when a post was processed but had no outbound links (instead of a blank row). |

### Patch ordering

Patches run alphabetically via `for patch in scripts/patch-*.mjs`. For webmention patches:

1. `patch-webmention-sender-empty-details.mjs` — targets the `.njk` template (independent)
2. `patch-webmention-sender-livefetch.mjs` — replaces the fetch block in `webmention-sender.js`
3. `patch-webmention-sender-reset-stale.mjs` — MongoDB migration (independent)
4. `patch-webmention-sender-retry.mjs` — detects the livefetch v2 marker and silently skips; logs "already applied" (not a misleading "package updated?" warning)

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
The live page was fetched, had a valid `.h-entry`, but no `<a href>` tags with external URLs were found. Check that the post's Eleventy template renders the microformat links (`u-like-of`, etc.) correctly. If the post previously processed with 0 results due to an error page (502, redirect), bump the `MIGRATION_ID` in `patch-webmention-sender-reset-stale.mjs` and restart to force a retry.

**502 Bad Gateway on first poll**
The readiness check (`/webmention-sender/api/status`) should prevent this. If it still happens, the plugin may have registered its routes but MongoDB isn't ready yet. Increase the readiness timeout or check MongoDB connectivity.

**Posts stuck as "not sent" / retrying every cycle**
The live page fetch is failing every time. Check:
1. `INTERNAL_FETCH_URL` is set and nginx port 80 is reachable from the node jail
2. nginx port 80 has `proxy_set_header X-Forwarded-Proto https` (prevents redirect loop)
3. The post URL actually resolves to a page (not a 404)

**Previously failed posts not retrying**
Bump the `MIGRATION_ID` in `scripts/patch-webmention-sender-reset-stale.mjs` to a new version string and restart. The migration resets all posts marked as sent with empty results (both numeric-zero and empty-array formats). It is idempotent per ID — bumping the ID forces it to run once more.

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

**`patch-webmention-sender-livefetch.mjs`** (v2)
Forces the webmention sender to always fetch the live published page. Validates the response contains `h-entry` before using it — rejects error pages and 502 responses that would silently produce zero links. Rewrites the fetch URL via `INTERNAL_FETCH_URL` for jailed setups. Does not fall back to stored content (which lacks template-rendered microformat links). Upgrades from v1 in-place; silently skips if already at v2.

**`patch-webmention-sender-retry.mjs`**
Predecessor to livefetch, now fully superseded. Silently skips when livefetch v2 marker is present so it does not log misleading "package updated?" warnings. Kept in case livefetch fails to find its target (acts as a partial fallback).

**`patch-webmention-sender-reset-stale.mjs`** (v9)
One-time migration (guarded by a `migrations` MongoDB collection entry, currently `webmention-sender-reset-stale-v9`) that resets posts incorrectly marked as webmention-sent with empty results. Matches both old numeric-zero format and new v1.0.6+ empty-array format. Bump the `MIGRATION_ID` to re-run after future bugs.

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

### 2026-03-22

**fix(mastodon-api): follower/following accounts show wrong created_at; URL-type AP lookup** (`6c13eb8` in svemagie/indiekit-endpoint-activitypub)
All places in `accounts.js` that build actor objects from `ap_followers`/`ap_following` documents were omitting the `createdAt` field. `serializeAccount()` fell back to `new Date().toISOString()`, so every follower and following account appeared to have joined "just now" in the Mastodon client. Fix: pass `createdAt: f.createdAt || undefined` in all five locations — the `/followers`, `/following`, `/lookup` endpoints and both branches of `resolveActorData()`. Additionally, HTTP actor URLs in `resolve-account.js` are now passed to `lookupWithSecurity()` as native `URL` objects instead of bare strings (matching Fedify's preferred type); the `acct:user@domain` WebFinger path stays as a string since WHATWG `new URL()` misparses the `@` as a user-info separator.

**fix(mastodon): remote profile pictures and follower stats missing in Mastodon client** (`ed18446` in svemagie/indiekit-endpoint-activitypub)
`resolveRemoteAccount()` in `lib/mastodon/helpers/resolve-account.js` called `ctx.lookupObject()` directly. Servers that return 400/403 for signed GETs (e.g. some Mastodon/Pleroma instances) caused the lookup to throw, so the function returned `null` — making profile pages show no avatar and zero follower/following/statuses counts. Fix: replace with `lookupWithSecurity()` (the same signed→unsigned fallback wrapper used everywhere else in the codebase) and obtain a `documentLoader` first so the signed attempt can attach the actor's HTTP signature. Additionally wrapped `getFollowers()`, `getFollowing()`, and `getOutbox()` collection fetches in a 5-second `Promise.race` timeout so slow remote servers no longer block the profile response indefinitely.

**fix(mastodon-api): DM sent from Mastodon client created a public blog post** (`99964e9` in svemagie/indiekit-endpoint-activitypub)
`POST /api/v1/statuses` with `visibility="direct"` fell through to the Micropub pipeline, which has no concept of Mastodon's `"direct"` visibility — so it created a normal public blog post. Fix: intercept `visibility === "direct"` before Micropub: resolve the `@user@domain` mention via WebFinger (Fedify lookup as fallback), build a `Create/Note` AP activity addressed only to the recipient (no public/followers `cc`), send via `ctx.sendActivity()`, store in `ap_notifications` for the DM thread view, return a minimal status JSON to the client. No blog post is created.

**fix(mastodon-api): DM response returned "no data" in Mastodon client** (`4816033` in svemagie/indiekit-endpoint-activitypub)
After the DM was sent, the Mastodon client received a bare `{}` object instead of a proper status entity, showing "no data". Root cause: the DM path returned a hand-rolled minimal JSON object instead of calling `serializeStatus()`. Fix: build a full `timelineItem` document (matching the shape used by the home timeline) and pass it through `serializeStatus()` so all ~20 required Mastodon status fields (`id`, `account`, `media_attachments`, `tags`, `emojis`, etc.) are present.

**fix(mastodon-api): DM 404 immediately after send, then disappeared from thread view** (`7b838ea` in svemagie/indiekit-endpoint-activitypub)
Follow-up to the "no data" fix: the DM item was never actually persisted because `addTimelineItem()` was called as `addTimelineItem(collections.ap_timeline, item)`, passing the raw MongoDB collection directly. `addTimelineItem` expects the whole `collections` object and destructures `{ ap_timeline }` from it — passing the collection itself caused `undefined.updateOne` to throw at insert time. The stored item was absent so the subsequent `GET /api/v1/statuses/:id` 404'd. Fix: pass `collections` (not `collections.ap_timeline`).

**fix(activitypub): like/reblog from Mastodon client throws "collection.get is not a function"** (`0a686d7` in svemagie/indiekit-endpoint-activitypub)
`resolveAuthor()` in `lib/resolve-author.js` called `collections.get("ap_timeline")` assuming a `Map` (correct for the native AP inbox path), but the Mastodon Client API passes `req.app.locals.mastodonCollections` as a plain object. Every favourite/reblog action from Phanpy, Elk, or any other Mastodon client hit this error. Fix: `typeof collections.get === "function"` guard selects between Map-style and object-style access so both paths work.

**chore(patches): remove 11 obsolete AP patch scripts** (`18a946c9e`)
All of the following features are now baked into `svemagie/indiekit-endpoint-activitypub` natively; the patch scripts were either no-ops or (in the case of `patch-ap-repost-commentary`) actively harmful (inserting a duplicate `else if` block on every deploy, preventing startup). Root cause: upstream merges absorbed our custom commits, leaving the OLD snippets absent from the source so patches silently skipped — except Fix D of repost-commentary which still matched a generic `} else {` block and corrupted `jf2-to-as2.js`.
- `patch-ap-repost-commentary` — repost commentary in AP output (Create/Note with commentary)
- `patch-ap-url-lookup-api` — `/api/ap-url` endpoint
- `patch-ap-allow-private-address` — `allowPrivateAddress: true` in `createFederation`
- `patch-ap-like-note-dispatcher` — reverted fake-Note approach for likes
- `patch-ap-like-activity-id` — canonical `id` URI on Like activities (AP §6.2.1)
- `patch-ap-like-activity-dispatcher` — `setObjectDispatcher(Like, …)` for dereferenceable like URLs (AP §3.1)
- `patch-ap-url-lookup-api-like` — `/api/ap-url` returns `likeOf` URL for AP-likes
- `patch-ap-remove-federation-diag` — removed verbose federation diagnostics inbox log
- `patch-ap-normalize-nested-tags` — `cat.split("/").at(-1)` to strip nested tag prefixes
- `patch-ap-object-url-trailing-slash` — trailing-slash normalisation on AP object URLs (3 orphan scripts not in `package.json`)
- `patch-ap-og-image` — OG image in AP objects (orphan; feature remains undeployed)

`patch-ap-skip-draft-syndication` kept — draft guard in `syndicate()` not yet in fork.

**chore(deps): sync activitypub fork with upstream post-3.8.1** (`a37bece` in svemagie/indiekit-endpoint-activitypub)
Four upstream fixes merged since 3.8.1, plus resolution of merge artifacts introduced by the upstream sync:
- `9a0d6d20`: serve AP JSON for actor URLs received without an explicit `text/html` Accept header — fixes content negotiation for clients that omit Accept
- `4495667e`: remove RSA Multikey from `assertionMethod` in the actor document — was causing tags.pub signature verification failures
- `c71fd691`: direct follow workaround for tags.pub `identity/v1` JSON-LD context rejection — tags.pub rejects the W3C identity context on incoming follows; new `lib/direct-follow.js` sends follows without that context
- Merge artifacts removed: duplicate `import { getActorUrlFromId }` in `accounts.js`, duplicate `const cachedUrl` declaration in `resolveActorUrl`, and a stray extra `import { remoteActorId }` in `account-cache.js` — all introduced when cherry-picked commits were merged back against upstream's copy of the same changes

### 2026-03-21

**chore(deps): merge upstream activitypub v3.7.1–v3.7.5 into fork** (`97a902b` in svemagie/indiekit-endpoint-activitypub)
All five 3.7.x releases published upstream on 2026-03-21:
- `lookupWithSecurity` is now async with a signed→unsigned fallback — servers like tags.pub that return 400 on signed GETs now resolve correctly instead of returning null
- `enrichAccountStats()` (new `lib/mastodon/helpers/enrich-accounts.js`): enriches embedded account objects in timeline responses with real follower/following/post counts resolved via Fedify. Fixes 0/0/0 counts in Phanpy, which never calls `/accounts/:id` and trusts embedded data
- Status content processing: `processStatusContent()` linkifies bare URLs and converts `@user@domain` mentions to `<a>` links; `extractMentions()` populates the `mentions` array. Timeline date lookup now handles both `.000Z` and bare `Z` ISO suffixes
- `/api/v1/relationships`: `domain_blocking` is now computed from `ap_blocked_servers` instead of always returning `false`; `resolveActorUrl` falls back to the account cache for timeline-author resolution
- `/api/v1/domain_blocks`: returns real blocked server hostnames from `ap_blocked_servers` instead of `[]`
- Federation management dashboard: new Moderation section listing blocked servers, blocked accounts, and muted accounts with timestamps

**chore(deps): update activitypub fork to v3.6.8** (`fad383dfe`)
Pulls the merged upstream `feat/mastodon-client-api` branch into svemagie/indiekit-endpoint-activitypub (`f029c31`). Ships a full Mastodon Client API compatibility layer (`lib/mastodon/`), 13 additional locale files, and builds `signatureTimeWindow`/`allowPrivateAddress` directly into `federation-setup.js` — `patch-ap-allow-private-address` now cleanly detects "already up to date".

**fix(activitypub): serve AP-likes with canonical id and proper Like dispatcher** (`99d2e380`)
Replaces the fake-Note approach with strict AP protocol compliance. Four new patch scripts:
- `patch-ap-like-note-dispatcher`: reverts the fake-Note block
- `patch-ap-like-activity-id`: adds canonical `id` URI to Like activities (AP §6.2.1)
- `patch-ap-like-activity-dispatcher`: registers `setObjectDispatcher(Like, …)` so `/activitypub/activities/like/{id}` is dereferenceable (AP §3.1)
- `patch-ap-url-lookup-api-like`: `/api/ap-url` now returns the `likeOf` URL for AP-likes so the "Also on: Fediverse" widget's `authorize_interaction` flow opens the original post on the remote instance

**fix(activitypub): add Like vocab import in activity dispatcher patch** (`535e6f5e`)
On fresh installs where the old wrong patch was never applied, `Like` was absent from the `@fedify/fedify/vocab` import block, causing a `ReferenceError` at startup. The dispatcher patch now adds `Like` to the import if missing.

**fix(syndicate): normalize syndication property to array before dedup check** (`34d5fde5`)
Micropub's `replaceEntries()` stores single-value arrays as plain strings. Spreading a string into `[...str]` gives individual characters, so `hasSyndicationUrl()` never matched and `alreadySyndicated` was always false — causing re-syndication on every webhook trigger. Fix: use `[].concat()` which safely handles both string and array values.

**feat(deploy): trigger syndication webhook after successful deployment** (`b16c60ad`)
Added a `workflow_dispatch`-compatible step to `.github/workflows/deploy.yml` that fires a configurable webhook URL after a successful deploy. Subsequently reverted (`9668485b`) and moved to the blog repo.

**fix(activitypub): remove federation-diag inbox logging** (`109d39dd`)
New `patch-ap-remove-federation-diag.mjs` strips the verbose federation diagnostics log added during debugging.

**chore: silence github contribution log** (`25488257`)
New `patch-endpoint-github-contributions-log.mjs` suppresses the noisy per-contribution log line from the GitHub store endpoint.

---

### 2026-03-20

**fix(ap): include commentary in repost ActivityPub activities** (`b53afe2e`)
Reposts with a body were silently broken in two ways: (1) `jf2ToAS2Activity()` always emitted a bare `Announce` pointing at an external URL that doesn't serve AP JSON, so Mastodon dropped the activity from followers' timelines; (2) `jf2ToActivityStreams()` hard-coded Note content to `🔁 <url>`, ignoring `properties.content`. New `patch-ap-repost-commentary.mjs` (4 targeted replacements): skips the `Announce` early-return when commentary is present and falls through to `Create(Note)` instead; formats Note as `<commentary>\n\n🔁 <url>`; extracts commentary in the content-negotiation path. Pure reposts (no body) keep the `Announce` behaviour unchanged.

**chore(ai): remove custom AI patches superseded by upstream endpoint-posts@beta.44** (`fe0f347e`)
Removed 6 patch scripts now handled natively by upstream:
- `patch-preset-eleventy-ai-frontmatter` — upstream writes AI frontmatter with hyphenated keys natively
- `patch-endpoint-posts-ai-cleanup` — upstream beta.44 removes empty AI fields natively
- `patch-endpoint-posts-ai-fields` — upstream beta.44 has AI form UI inline in `post-form.njk`
- `patch-micropub-ai-block-resync` — one-time stale-block migration, no longer relevant
- `patch-endpoint-posts-prefill-url` — upstream beta.44 has native prefill from query params
- `patch-endpoint-posts-search-tags` — upstream beta.44 has native search/filter/sort UI

Also bumped `@rmdes/indiekit-endpoint-posts` beta.25→beta.44 and removed `camelCase` AI field names from all `postTypes.fields` in `indiekit.config.mjs`.

**fix(webmention): livefetch evolution v3→v5** (`11d600058`, `7f9f02bc3`, `17b93b3a2`)
Three successive fixes to the webmention sender livefetch patch, driven by split-DNS and jail networking constraints:

- **v3** (`11d600058`): Send `Host: blog.giersig.eu` on internal fetches so nginx routes to the correct vhost; add `fetchUrl` diagnostics and response body preview on h-entry check failure
- **v4** (`7f9f02bc3`): Remove `INTERNAL_FETCH_URL` rewrite for live page fetches — post URLs require authentication on the internal nginx vhost (returns login page). Fetch from `postUrl` (public URL) directly. Add `WEBMENTION_LIVEFETCH_URL` as an opt-in override
- **v5** (`17b93b3a2`): Replace live page fetch entirely with a synthetic h-entry HTML snippet built from `post.properties` stored in MongoDB (`in-reply-to`, `like-of`, `bookmark-of`, `repost-of`, `content.html`). No network fetch required — eliminates all split-DNS / auth reliability issues

**fix: h-entry double-quote typo in livefetch patch** (`750267b17`)
Removed a stray extra closing quote (`h-entry""`) introduced in the v2 patch, which broke the string match on case-sensitive systems.

---

### 2026-03-19

**feat: deliver likes as bookmarks, revert announce cc, add OG images** (`45f8ba9` in svemagie/indiekit-endpoint-activitypub)
Likes are now sent as Create/Note with bookmark-style content (🔖 emoji + URL + `#bookmark` tag) instead of Like activities — ensures proper display on Mastodon. Announce activities reverted to upstream @rmdes addressing (`to: Public` only, no `cc: followers`). Both plain JSON-LD and Fedify Note/Article objects now include a per-post OG image derived from the post URL pattern. Removed unused `patch-ap-like-announce-addressing.mjs`.

**feat: add soft-delete filter and content-warning support to blog theme** (`d9ac9bf` in svemagie/blog)
Posts with `deleted: true` are now excluded from all Eleventy collections (supports AP soft-delete). Posts with `contentWarning`/`content_warning` frontmatter show a collapsible warning on post pages and a warning label (hiding content + photos) on listing pages.

**chore: merge upstream rmdes:main v2.13.0–v2.15.4 into fork** (`b99f5fb`)
Merged 15 upstream commits adding: manual follow approval, custom emoji, FEP-8fcf/fe34 compliance (v2.13.0), server blocking, Redis caching, key refresh, async inbox queue (v2.14.0), outbox failure handling with strike system, reply chain forwarding, reply intelligence in reader (v2.15.0–v2.15.4), CW `content-warning` property, soft-delete filtering, `as:Endpoints` type stripping. Preserved our DM compose path, Like/Announce addressing, draft/unlisted outbox guards.

**chore: remove 5 obsolete AP patches** — `patch-ap-object-url-trailing-slash`, `patch-ap-normalize-nested-tags`, `patch-ap-like-announce-addressing`, `patch-inbox-skip-view-activity-parse`, `patch-inbox-ignore-view-activity` are now baked into the fork source.

**fix: update patch-ap-allow-private-address for v2.15 comment style** — The upstream `createFederation` block changed its comment format; updated the patch to match.

**fix: patch webmention-sender syntax error** (`c6b0e702`)
`@rmdes/indiekit-endpoint-webmention-sender@1.0.8` shipped with a typo: `_html.includes("h-entry"")` — the extra closing quote causes a `SyntaxError` at startup and prevents the background sync from ever running. New `patch-webmention-sender-hentry-syntax.mjs` fixes the typo before any other webmention-sender patches run.

**fix: livefetch v2 patch improvements** (`711958b8`)
- retry patch: silently skips when livefetch v2 marker is present (no more misleading "target snippet not found (package updated?)" noise on every startup)
- livefetch: match `h-entry"` or `h-entry ` instead of bare `h-entry` to avoid false positives from body text containing the string
- reset-stale: update comment to reference livefetch v2 as the patch that prevents recurrence

**fix(webmention): validate live page has .h-entry before processing** (`c4f654fe`)
Root cause of stuck webmentions: the livefetch got a 200 OK response that was actually an nginx 502 or login-redirect HTML page. No `.h-entry` → `extractLinks` found 0 links → post permanently marked as sent with empty results.

- livefetch upgraded to v2: checks `_html.includes("h-entry\"")` before using the response; rejects error pages instead of processing them; no fallback to stored content (which lacks microformat links for likes/reposts/bookmarks); detects and upgrades v1 patch in-place
- reset-stale bumped to v9: broadened MongoDB `$or` query to match both old numeric-zero format and new v1.0.6+ empty-array format (`$size: 0`)
- retry patch: now silently skips when livefetch v2 marker is present (no more misleading "target snippet not found (package updated?)" noise on every startup)
- start.sh readiness check: now polls `/webmention-sender/api/status` (plugin's own endpoint) instead of `/status` (bare Express), ensuring MongoDB collections and plugin routes are fully initialised before the first poll

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
