# indiekit-blog

## Admin login

- The IndieKit admin is expected to run behind `/admin`.
- Set `INDIEKIT_ADMIN_URL` to the public admin base URL, including trailing slash (example: `https://blog.giersig.eu/admin/`).
- Login uses `PASSWORD_SECRET` (bcrypt hash), not `INDIEKIT_PASSWORD`.
- If no `PASSWORD_SECRET` exists yet, open `/admin/auth/new-password` once to generate it.

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
- If these paths do not match the content repo structure, edit/delete actions can fail with GitHub `Not Found`.

## GitHub tokens

- Recommended for two-repo setups:
- `GH_CONTENT_TOKEN`: token for content repo (`blog`), used by `@indiekit/store-github`.
- `GH_ACTIVITY_TOKEN`: token for GitHub dashboard/activity endpoint, used by `@rmdes/indiekit-endpoint-github`.
- `GITHUB_USERNAME`: GitHub user/owner name.
- Backward compatibility: if `GH_CONTENT_TOKEN` or `GH_ACTIVITY_TOKEN` are not set, config falls back to `GITHUB_TOKEN`.