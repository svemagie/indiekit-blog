# @rmdes/indiekit-endpoint-syndicate

Syndication endpoint for Indiekit. Fork of @indiekit/endpoint-syndicate with batch syndication support and critical bug fixes.

## Features

- **Single Post Syndication** - Syndicate a specific post to configured targets
- **Batch Syndication** - Process all pending posts at once (useful for cron jobs)
- **Webhook Support** - Netlify webhook signature verification
- **Partial Syndication** - Correctly handles posts partially syndicated (fixed upstream bug)
- **Failed Target Retry** - Automatically retries failed syndication targets
- **Rate Limiting** - 2-second delay between posts in batch mode
- **Detailed Results** - Per-post success/failure tracking in batch mode

## Bug Fixes vs Upstream

### Critical Fixes

1. **Array.isArray Bug** - Fixed function reference bug that prevented correct array detection
2. **Partial Syndication** - Removed filter that prevented retry of partially syndicated posts
3. **Enhanced Error Handling** - Per-post error tracking instead of failing entire batch

### New Features

- Batch mode for processing all pending posts
- Detailed results array with success/failure per post
- Better console logging for debugging

## Installation

```bash
npm install @rmdes/indiekit-endpoint-syndicate
```

## Configuration

Add to your `indiekit.config.js`:

```javascript
import SyndicateEndpoint from "@rmdes/indiekit-endpoint-syndicate";
import BlueskyyndicatorSyndicator from "@rmdes/indiekit-syndicator-bluesky";
import MastodonSyndicator from "@rmdes/indiekit-syndicator-mastodon";

export default {
  plugins: [
    // Configure syndicators first
    new BlueskyyndicatorSyndicator({
      user: "username.bsky.social",
      password: process.env.BLUESKY_PASSWORD
    }),
    new MastodonSyndicator({
      url: "https://mastodon.social",
      accessToken: process.env.MASTODON_TOKEN
    }),

    // Add syndication endpoint
    new SyndicateEndpoint({
      mountPath: "/syndicate"  // Default: /syndicate
    })
  ]
};
```

### Environment Variables

```bash
# Required for token signing
SECRET=your-secret-key

# Required for Netlify webhook verification (optional)
WEBHOOK_SECRET=your-netlify-webhook-secret
```

## Usage

### Single Post Syndication

**Query Parameters:**
```bash
POST /syndicate?source_url=https://yoursite.com/posts/hello-world&token=YOUR_TOKEN
```

**Request Body:**
```bash
curl -X POST https://yoursite.com/syndicate \
  -H "Content-Type: application/json" \
  -d '{
    "syndication": {
      "source_url": "https://yoursite.com/posts/hello-world",
      "redirect_uri": "/posts"
    },
    "access_token": "YOUR_TOKEN"
  }'
```

### Batch Syndication (All Pending Posts)

```bash
curl -X POST https://yoursite.com/syndicate?token=YOUR_TOKEN
```

This will:
1. Find all posts with `mp-syndicate-to` property
2. Process each post sequentially (2-second delay between posts)
3. Return detailed results for each post

### Netlify Webhook (Auto-Syndicate After Deploy)

**Netlify Configuration:**
1. Go to Site Settings → Build & deploy → Deploy notifications
2. Add notification: Outgoing webhook
3. Event: Deploy succeeded
4. URL: `https://yoursite.com/syndicate`
5. Save webhook secret to `WEBHOOK_SECRET` env var

**How It Works:**
1. Netlify deploys your site
2. Netlify sends webhook with JWT signature
3. Endpoint verifies signature, generates short-lived token
4. Endpoint syndicates all pending posts

## API Reference

### POST /syndicate

Syndicate post(s) to external services.

**Authentication:**
- Bearer token (header, body, or query)
- OR Netlify webhook signature

**Request:**

Query parameters:
- `source_url` (optional) - Specific post URL to syndicate
- `redirect_uri` (optional) - Redirect after success (must start with `/`)
- `token` (optional) - Bearer token

Body (JSON):
```json
{
  "syndication": {
    "source_url": "https://yoursite.com/posts/hello-world",
    "redirect_uri": "/posts"
  },
  "access_token": "YOUR_TOKEN"
}
```

**Response (Single Post):**
```json
{
  "success": "Post updated",
  "success_description": "Added syndication https://bsky.app/profile/user/post/123"
}
```

**Response (Batch Mode):**
```json
{
  "success": "OK",
  "success_description": "Processed 5 post(s): 4 succeeded, 1 failed",
  "results": [
    {
      "url": "https://yoursite.com/posts/post-1",
      "success": true,
      "syndicatedUrls": [
        "https://bsky.app/profile/user/post/123",
        "https://mastodon.social/@user/456"
      ]
    },
    {
      "url": "https://yoursite.com/posts/post-2",
      "success": true,
      "syndicatedUrls": ["https://bsky.app/profile/user/post/789"],
      "failedTargets": ["https://mastodon.social/@user"]
    },
    {
      "url": "https://yoursite.com/posts/post-3",
      "success": false,
      "error": "Micropub update failed: 401 Unauthorized"
    }
  ]
}
```

## How It Works

### Data Flow

1. **Post Created** - Micropub endpoint creates post with `mp-syndicate-to` property
2. **Trigger Received** - Webhook, cron, or manual POST to `/syndicate`
3. **Query Posts** - Find posts with `mp-syndicate-to` in MongoDB
4. **Syndicate** - Call syndicator plugins for each target
5. **Update Post** - Send Micropub update with syndicated URLs
6. **Cleanup** - Remove `mp-syndicate-to` if all targets succeeded

### Post Properties

**Before Syndication:**
```json
{
  "url": "https://yoursite.com/posts/hello-world",
  "mp-syndicate-to": [
    "https://bsky.app/@username",
    "https://mastodon.social/@username"
  ]
}
```

**After Syndication (All Succeeded):**
```json
{
  "url": "https://yoursite.com/posts/hello-world",
  "syndication": [
    "https://bsky.app/profile/username/post/abc123",
    "https://mastodon.social/@username/456789"
  ]
}
```

**After Syndication (One Failed):**
```json
{
  "url": "https://yoursite.com/posts/hello-world",
  "mp-syndicate-to": [
    "https://mastodon.social/@username"
  ],
  "syndication": [
    "https://bsky.app/profile/username/post/abc123"
  ]
}
```

### Syndicator Plugin Interface

Syndicator plugins must implement:

```javascript
export default class MySyndicator {
  get info() {
    return {
      uid: "https://example.com/@username",
      name: "Example Service"
    };
  }

  async syndicate(properties, publication) {
    // Post to external service
    // Return syndicated URL or null if failed
    return "https://example.com/@username/post/123";
  }

  init(Indiekit) {
    Indiekit.addSyndicator(this);
  }
}
```

## Common Use Cases

### 1. Cron Job (Daily Batch Syndication)

```bash
#!/bin/bash
# Crontab: 0 9 * * * /path/to/syndicate.sh

curl -X POST https://yoursite.com/syndicate?token=$INDIEKIT_TOKEN
```

### 2. GitHub Actions (Post-Deploy)

```yaml
name: Deploy and Syndicate

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy site
        run: # ... deploy steps ...

      - name: Syndicate posts
        run: |
          curl -X POST https://yoursite.com/syndicate \
            -H "Authorization: Bearer ${{ secrets.INDIEKIT_TOKEN }}"
```

### 3. Manual Trigger from Admin UI

```html
<form method="POST" action="/syndicate">
  <input type="hidden" name="syndication[source_url]" value="{{ post.url }}">
  <input type="hidden" name="syndication[redirect_uri]" value="/posts">
  <input type="hidden" name="access_token" value="{{ token }}">
  <button type="submit">Syndicate Now</button>
</form>
```

## Troubleshooting

### Posts Not Being Syndicated

**Check 1: Post has `mp-syndicate-to` property**
```javascript
db.posts.findOne({ "properties.url": "https://yoursite.com/posts/hello-world" })
// Should have: properties.mp-syndicate-to: ["https://bsky.app/@user", ...]
```

**Check 2: Post is not a draft**
```javascript
// properties.post-status should NOT be "draft"
```

**Check 3: Syndicators are configured**
```javascript
// In indiekit.config.js, syndicators must be loaded BEFORE syndicate endpoint
```

**Check 4: Token is valid**
```bash
# Test with explicit token
curl -X POST https://yoursite.com/syndicate?source_url=URL&token=TOKEN
```

### Partial Syndication Not Retrying

This was a bug in upstream `@indiekit/endpoint-syndicate`. This fork fixes it.

**Example:**
- Post has `mp-syndicate-to: ["https://bsky.app", "https://mastodon.social"]`
- First run: Bluesky succeeds, Mastodon fails
- Post now has `mp-syndicate-to: ["https://mastodon.social"]` and `syndication: ["https://bsky.app/..."]`
- **Upstream:** Post is skipped (has `syndication` property)
- **This fork:** Post is processed, Mastodon is retried

### Rate Limiting Errors

Batch mode waits 2 seconds between posts. If you still hit rate limits:
- Reduce batch size (manually split posts)
- Increase delay (modify `delay(2000)` in `syndicate.js`)
- Syndicate to fewer targets at once

## Migration from Upstream

```bash
npm uninstall @indiekit/endpoint-syndicate
npm install @rmdes/indiekit-endpoint-syndicate
```

```javascript
// Update import
import SyndicateEndpoint from "@rmdes/indiekit-endpoint-syndicate";
```

No other changes needed - fully backwards compatible.

## Requirements

- **Indiekit** >= 1.0.0-beta.25
- **MongoDB** database (for posts collection)
- **Syndicator plugins** (e.g., `@rmdes/indiekit-syndicator-bluesky`)
- **Node.js** >= 20

## License

MIT

## Author

Ricardo Mendes - https://rmendes.net

## Repository

https://github.com/rmdes/indiekit-endpoint-syndicate

## Upstream

Fork of [@indiekit/endpoint-syndicate](https://github.com/getindiekit/indiekit/tree/main/packages/endpoint-syndicate) by Paul Lloyd.
