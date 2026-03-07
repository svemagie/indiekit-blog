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