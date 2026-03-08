# indiekit-blog

## Admin login

- The IndieKit admin is expected to run behind `/admin`.
- Set `INDIEKIT_ADMIN_URL` to the public admin base URL, including trailing slash (example: `https://blog.giersig.eu/admin/`).
- When `INDIEKIT_ADMIN_URL` is set, config wires absolute auth endpoints/callback base (`/auth`, `/auth/token`, `/auth/introspect`) to that URL to keep login redirects on `/admin/*`.
- Login uses `PASSWORD_SECRET` (bcrypt hash), not `INDIEKIT_PASSWORD`.
- If no `PASSWORD_SECRET` exists yet, open `/admin/auth/new-password` once to generate it.
- Post management UI should use `/posts` (`@indiekit/endpoint-posts.mountPath`).
- Do not set post-management `mountPath` to frontend routes like `/blog`, otherwise backend publishing can be shadowed by the public site.

## Backend endpoints

- Configured endpoint mount paths:
- Posts management: `/posts`
- Files: `/files`
- Webmentions moderation + API: `/webmentions`
- Conversations + API: `/conversations`
- GitHub activity + API: `/github`
- If IndieKit is reverse-proxied behind `/admin`, these become `/admin/posts`, `/admin/files`, etc.

## MongoDB

- Preferred: set a full `MONGO_URL` (example: `mongodb://user:pass@host:27017/indiekit?authSource=admin`).
- If `MONGO_URL` is not set, config builds the URL from `MONGO_USERNAME`, `MONGO_PASSWORD`, `MONGO_HOST`, `MONGO_PORT`, `MONGO_DATABASE`, `MONGO_AUTH_SOURCE`.
- For `MongoServerError: Authentication failed`, first verify `MONGO_PASSWORD`, then try `MONGO_AUTH_SOURCE=admin`.

## Content paths

- This setup writes post files to the content repo `blog` under `content/`.
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

## Startup script

- `start.sh` is intentionally ignored by Git (`.gitignore`) so server secrets are not committed.
- Use `start.example.sh` as the tracked template and keep real credentials in environment variables (or `.env` on the server).
- Startup scripts parse `.env` with the `dotenv` parser (not shell `source`), so values containing spaces are handled safely.
- Startup scripts run patch helpers before boot (`scripts/patch-lightningcss.mjs`, `scripts/patch-endpoint-media-scope.mjs`, `scripts/patch-endpoint-files-upload-route.mjs`, `scripts/patch-frontend-serviceworker-file.mjs`, `scripts/patch-conversations-collection-guards.mjs`).
- The media scope patch fixes a known upstream issue where file uploads can fail if the token scope is `create update delete` without explicit `media`.
- The files upload route patch fixes browser multi-upload by posting to `/files/upload` (session-authenticated) instead of direct `/media` calls without bearer token.
- The frontend serviceworker patch ensures `@indiekit/frontend/lib/serviceworker.js` exists at runtime to avoid ENOENT in the offline/service worker route.
- The conversations guard patch prevents `Cannot read properties of undefined (reading 'find')` when the `conversation_items` collection is temporarily unavailable.