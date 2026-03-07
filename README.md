# indiekit-blog

## Admin login

- The IndieKit admin is expected to run behind `/admin`.
- Set `INDIEKIT_ADMIN_URL` to the public admin base URL, including trailing slash (example: `https://blog.giersig.eu/admin/`).
- Login uses `PASSWORD_SECRET` (bcrypt hash), not `INDIEKIT_PASSWORD`.
- If no `PASSWORD_SECRET` exists yet, open `/admin/auth/new-password` once to generate it.