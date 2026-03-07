# @rmdes/indiekit-endpoint-micropub

Micropub endpoint for Indiekit with custom type-based post discovery and pre-syndication markup support. Enables publishing content to your website using the [Micropub protocol](https://micropub.spec.indieweb.org/).

## Fork Notice

This is a fork of `@indiekit/endpoint-micropub` with two custom features:

### 1. Pre-Syndication Markup Support

Services like [IndieNews](https://news.indieweb.org/) require a `u-syndication` link in your HTML **before** they receive the syndication webmention. The upstream Micropub endpoint strips all `mp-*` properties (including `mp-syndicate-to`) before passing data to the preset's `postTemplate()`.

This fork preserves `mp-syndicate-to` so that:
1. The property reaches the preset's `postTemplate()`
2. The preset can include it in frontmatter (as `mpSyndicateTo` in Eleventy)
3. The theme can render the `u-syndication` link
4. IndieNews (and similar services) can find the link when parsing the webmention

**Technical change** in `lib/utils.js`:

```javascript
// mp- properties to preserve for the template (needed for pre-syndication markup)
const preserveMpProperties = ["mp-syndicate-to"];

for (let key in templateProperties) {
  if (key.startsWith("mp-") && !preserveMpProperties.includes(key)) {
    delete templateProperties[key];
  }
  // ...
}
```

### 2. Type-Based Post Type Discovery

The external `@paulrobertlloyd/mf2tojf2` library only preserves standard microformat properties during mf2→JF2 conversion. Custom discovery properties were being stripped, making it impossible for custom post type plugins to trigger type detection.

This fork adds a type-based discovery mechanism in `lib/post-type-discovery.js`:

```javascript
// If post has a custom type (h value) that matches a configured post type
// This allows plugins to use h: "page" or similar for type-based discovery
if (properties.type && properties.type !== "entry" && postTypes[properties.type]) {
  return properties.type;
}
```

This enables custom post type plugins like `@rmdes/indiekit-post-type-page` to work correctly.

## Installation

```bash
npm install @rmdes/indiekit-endpoint-micropub
```

### Using npm overrides (recommended)

Add to your `package.json`:

```json
{
  "overrides": {
    "@indiekit/endpoint-micropub": "npm:@rmdes/indiekit-endpoint-micropub@^1.0.0-beta.28"
  }
}
```

This replaces the upstream package with this fork without changing your plugin configuration.

### Direct installation

```javascript
import MicropubEndpoint from "@rmdes/indiekit-endpoint-micropub";

export default {
  plugins: [
    new MicropubEndpoint({
      mountPath: "/micropub"  // Optional, defaults to /micropub
    })
  ]
};
```

## Configuration

### Options

| Option      | Type     | Description                                                               |
| :---------- | :------- | :------------------------------------------------------------------------ |
| `mountPath` | `string` | Path to listen to Micropub requests. Optional, defaults to `/micropub`. |

## Supported Endpoints

### POST /micropub (Action Endpoint)

Create, update, delete, or undelete posts using the Micropub protocol.

**Actions:**
- `create` - Create new post (requires `create` or `post` scope)
- `update` - Update existing post (requires `update` scope)
- `delete` - Delete post (requires `delete` scope)
- `undelete` - Restore deleted post (requires `create` scope)

**Update operations:**
- `replace` - Replace entire property value
- `add` - Add value to existing property
- `delete` - Delete property or specific values

### GET /micropub (Query Endpoint)

Query published posts and configuration.

**Supported queries:**

| Query | Description | Example |
|-------|-------------|---------|
| `config` | Full configuration | `/micropub?q=config` |
| `media-endpoint` | Media endpoint URL | `/micropub?q=media-endpoint` |
| `syndicate-to` | Available syndication targets | `/micropub?q=syndicate-to` |
| `post-types` | Supported post types | `/micropub?q=post-types` |
| `category` | Publication categories | `/micropub?q=category` |
| `channel` | Publication channels | `/micropub?q=channel` |
| `source` | Published posts (paginated) | `/micropub?q=source` |
| `source&url=URL` | Single post by URL | `/micropub?q=source&url=https://example.com/post` |

**Pagination parameters:**
- `filter` - Filter results by string match
- `limit` - Maximum number of results
- `offset` - Skip first N results
- `after` - Cursor for next page
- `before` - Cursor for previous page

Example: `/micropub?q=source&filter=web&limit=10&offset=10`

## Features

### Media Uploads

Supports file uploads via multipart/form-data for `photo`, `video`, and `audio` properties. Files are uploaded to the media endpoint before post creation.

### Post Type Discovery

Implements the [Post Type Discovery](https://ptd.spec.indieweb.org/) algorithm with custom type-based detection:

1. Event type (`type: "event"`)
2. **Custom h type** (fork feature - matches configured post type names)
3. Standard discovery properties (`rsvp`, `repost-of`, `like-of`, `in-reply-to`, `video`, `photo`)
4. Custom discovery properties (from post type config)
5. Collection (populated `children` array)
6. Article (`name` + `content`)
7. Note (default fallback)

### Content Normalization

Automatically converts between Markdown and HTML:
- Plaintext only → generates HTML via markdown-it
- HTML only → generates plaintext via Turndown
- Markdown conversion uses typographer and smart quotes

### Soft Deletes

Deleted posts are not removed from the database. They store `_deletedProperties` for restoration via the `undelete` action.

## Requirements

This endpoint requires:
- MongoDB database for storing post metadata
- IndieAuth authentication endpoint (`@indiekit/endpoint-auth` or `@rmdes/indiekit-endpoint-auth`)
- Media endpoint (`@indiekit/endpoint-media`)
- At least one post type plugin
- At least one preset plugin (Jekyll, Hugo, Eleventy, etc.)
- At least one store plugin (GitHub, GitLab, Gitea)

## Related Plugins

### Works With

- **Post types:** `@indiekit/post-type-*`, `@rmdes/indiekit-post-type-page`
- **Syndicators:** `@rmdes/indiekit-syndicator-bluesky`, `@rmdes/indiekit-syndicator-mastodon`, `@rmdes/indiekit-syndicator-indienews`
- **Presets:** `@rmdes/indiekit-preset-eleventy`, `@indiekit/preset-jekyll`, `@indiekit/preset-hugo`
- **Stores:** `@indiekit/store-github`, `@indiekit/store-gitlab`, `@indiekit/store-gitea`

### Optional

- `@indiekit/endpoint-posts` or `@rmdes/indiekit-endpoint-posts` - Web UI for post management
- `@indiekit/endpoint-syndicate` or `@rmdes/indiekit-endpoint-syndicate` - Manual syndication UI

## Documentation

See [CLAUDE.md](./CLAUDE.md) for complete technical reference, architecture details, and integration guidance.

## Debugging

Enable debug output:

```bash
DEBUG=indiekit:endpoint-micropub:* npm start
```

## License

MIT - Original work by [Paul Robert Lloyd](https://paulrobertlloyd.com), custom features by [Ricardo Mendes](https://rmendes.net).
