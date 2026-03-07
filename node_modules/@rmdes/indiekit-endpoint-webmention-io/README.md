# @rmdes/indiekit-endpoint-webmention-io

Webmention moderation endpoint for [Indiekit](https://getindiekit.com). Syncs webmentions from webmention.io into MongoDB with delete, block, and privacy removal capabilities.

## Features

- **Background Sync**: Automatically fetches webmentions from webmention.io every 15 minutes (configurable)
- **Moderation Dashboard**: Admin UI for hiding/unhiding webmentions
- **Domain Blocking**: Block spam domains (hides all mentions, blocks future ones)
- **Privacy Removal**: GDPR-compliant permanent deletion with domain blocking
- **Public JSON API**: Drop-in replacement for webmention.io API with server-side caching
- **MongoDB Storage**: Persistent storage with indexes for fast queries
- **Incremental Sync**: Only fetches new webmentions since last sync (efficient)
- **Full Re-sync**: Option to clear and re-import all webmentions

## Installation

```bash
npm install @rmdes/indiekit-endpoint-webmention-io
```

## Configuration

```javascript
// indiekit.config.js
export default {
  plugins: [
    "@rmdes/indiekit-endpoint-webmention-io",
  ],

  "@rmdes/indiekit-endpoint-webmention-io": {
    mountPath: "/webmentions",            // Optional, default "/webmentions"
    token: process.env.WEBMENTION_IO_TOKEN,  // REQUIRED: webmention.io API token
    domain: "example.com",                // REQUIRED: domain to fetch webmentions for
    syncInterval: 900_000,                // Optional, default 15 minutes (in ms)
    cacheTtl: 60,                         // Optional, default 60 seconds (public API cache)
  },
};
```

### Getting Your Webmention.io Token

1. Sign up at [webmention.io](https://webmention.io)
2. Add your domain
3. Find your token in the dashboard
4. Store it in your `.env` file:
   ```bash
   WEBMENTION_IO_TOKEN=your_token_here
   ```

## Usage

### Admin Dashboard

Visit `/webmentions` in your Indiekit admin panel to:

- View all webmentions (paginated)
- Filter by visibility (all/visible/hidden)
- Filter by type (likes/replies/reposts/mentions)
- Hide/unhide individual webmentions
- Block spam domains
- Remove mentions for privacy requests (GDPR)

### Manual Sync

Trigger sync via admin dashboard buttons:
- **Sync Now**: Incremental sync (fetch only new mentions since last sync)
- **Full Re-sync**: Delete all and re-import everything from webmention.io

Or via POST requests:
```bash
# Incremental sync
curl -X POST https://your-site.com/webmentions/sync

# Full re-sync (destructive!)
curl -X POST https://your-site.com/webmentions/sync/full
```

### Public JSON API

The plugin exposes a public JSON API at `/webmentions/api/mentions` that can replace direct calls to webmention.io:

**Fetch all webmentions:**
```javascript
fetch('/webmentions/api/mentions?page=0&per-page=50')
```

**Filter by target URL:**
```javascript
fetch('/webmentions/api/mentions?target=https://example.com/post')
```

**Filter by type:**
```javascript
fetch('/webmentions/api/mentions?wm-property=like-of')
```

**Response format (JF2):**
```json
{
  "type": "feed",
  "name": "Webmentions",
  "children": [
    {
      "type": "entry",
      "wm-id": 12345,
      "wm-received": "2025-02-13T10:00:00.000Z",
      "wm-property": "in-reply-to",
      "wm-target": "https://example.com/post",
      "author": {
        "type": "card",
        "name": "Author Name",
        "url": "https://author.site/",
        "photo": "https://author.site/photo.jpg"
      },
      "url": "https://source.site/post",
      "published": "2025-02-13T09:00:00.000Z",
      "content": {
        "html": "<p>Reply text...</p>",
        "text": "Reply text..."
      }
    }
  ]
}
```

### Moderation Workflows

#### Hide a webmention
```bash
POST /webmentions/:wmId/hide
```
Marks the webmention as hidden (won't appear in public API).

#### Unhide a webmention
```bash
POST /webmentions/:wmId/unhide
```
Restores a hidden webmention.

#### Block a domain
```bash
POST /webmentions/block
Body: domain=spam.example.com
```
- Hides all existing mentions from the domain
- Adds domain to blocklist
- Future mentions from this domain are filtered during sync

#### Privacy removal (GDPR)
```bash
POST /webmentions/privacy-remove
Body: domain=user-request.example.com
```
- **Permanently deletes** all mentions from the domain
- Adds domain to blocklist with reason="privacy"
- Irreversible - use for GDPR/privacy requests only

#### Unblock a domain
```bash
POST /webmentions/blocklist/:domain/delete
```
- Removes domain from blocklist
- Unhides mentions that were hidden by the blocklist (not manual or privacy)

## API Reference

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (0-indexed, default: 0) |
| `per-page` | number | Items per page (max 10,000, default: 50) |
| `target` | string | Filter by target URL (with/without trailing slash) |
| `wm-property` | string | Filter by type: `in-reply-to`, `like-of`, `repost-of`, `mention-of`, `bookmark-of`, `rsvp` |

### Webmention Types

- `in-reply-to` - Replies
- `like-of` - Likes
- `repost-of` - Reposts/boosts
- `mention-of` - General mentions
- `bookmark-of` - Bookmarks
- `rsvp` - RSVP responses

## MongoDB Schema

The plugin creates two MongoDB collections:

### `webmentions`

```javascript
{
  wmId: 12345,                     // Webmention ID (unique)
  wmReceived: "2025-02-13T10:00:00.000Z",
  wmProperty: "in-reply-to",
  wmTarget: "https://example.com/post",
  authorName: "Author Name",
  authorUrl: "https://author.site/",
  authorPhoto: "https://author.site/photo.jpg",
  sourceUrl: "https://source.site/post",
  sourceDomain: "source.site",
  published: "2025-02-13T09:00:00.000Z",
  contentHtml: "<p>Reply text...</p>",
  contentText: "Reply text...",
  name: "Post title",
  hidden: false,
  hiddenAt: null,
  hiddenReason: null,  // "manual", "blocklist", "privacy"
  syncedAt: "2025-02-13T10:00:00.000Z",
  raw: { ... }  // Original JF2 entry
}
```

### `webmentionBlocklist`

```javascript
{
  domain: "spam.example.com",
  reason: "spam",  // "spam", "privacy", "manual"
  blockedAt: "2025-02-13T10:00:00.000Z",
  mentionsHidden: 5
}
```

## How It Works

1. **Background Sync**: Runs every 15 minutes (configurable)
2. **Incremental Fetching**: Uses `since_id` to only fetch new mentions
3. **Blocklist Filtering**: Mentions from blocked domains are never stored
4. **Pagination**: Fetches 100 mentions per page from webmention.io
5. **Rate Limiting**: 500ms delay between pages to avoid rate limits
6. **Caching**: Public API responses cached for 60 seconds (configurable)

## HTML Sanitization

All webmention HTML content is sanitized:
- Strips empty bridgy links
- Strips empty paragraphs
- Downgrades heading levels (h1→h3, h2→h4)
- Normalizes line breaks to paragraph breaks

## Comparison with Other Plugins

| Plugin | Purpose | Storage | API |
|--------|---------|---------|-----|
| **@rmdes/indiekit-endpoint-webmention-io** | Full moderation + public API | MongoDB | JF2 JSON |
| `@rmdes/indiekit-endpoint-webmentions-proxy` | Simple proxy (no moderation) | None | JF2 JSON |
| `@indiekit/endpoint-webmention` (upstream) | Admin dashboard only | None | HTML only |

Use this plugin if you need:
- Moderation capabilities
- Domain blocking
- Privacy removal (GDPR)
- Public API with caching
- Persistent storage

Use `@rmdes/indiekit-endpoint-webmentions-proxy` if you only need a simple public API without moderation.

## License

MIT

## Author

Ricardo Mendes - [rmendes.net](https://rmendes.net)

## Repository

[https://github.com/rmdes/indiekit-endpoint-webmention-io](https://github.com/rmdes/indiekit-endpoint-webmention-io)
