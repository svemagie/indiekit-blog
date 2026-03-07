const rawAdminUrl =
  process.env.INDIEKIT_ADMIN_URL || "https://blog.giersig.eu/admin/";
const adminUrl = new URL(
  rawAdminUrl.endsWith("/") ? rawAdminUrl : `${rawAdminUrl}/`,
).href;

const mongoUsername =
  process.env.MONGO_USERNAME || process.env.MONGO_USER || "indiekit";
const mongoPassword = process.env.MONGO_PASSWORD || "";
const mongoHost = process.env.MONGO_HOST || "10.100.0.20";
const mongoPort = process.env.MONGO_PORT || "27017";
const mongoDatabase =
  process.env.MONGO_DATABASE || process.env.MONGO_DB || "indiekit";
const mongoAuthSource = process.env.MONGO_AUTH_SOURCE || "";
const mongoCredentials =
  mongoUsername && mongoPassword
    ? `${encodeURIComponent(mongoUsername)}:${encodeURIComponent(
        mongoPassword,
      )}@`
    : "";
const mongoQuery =
  mongoCredentials && mongoAuthSource
    ? `?authSource=${encodeURIComponent(mongoAuthSource)}`
    : "";
const mongoUrl =
  process.env.MONGO_URL ||
  `mongodb://${mongoCredentials}${mongoHost}:${mongoPort}/${mongoDatabase}${mongoQuery}`;

export default {
  debug: "indiekit:*",
  application: {
    name: "Indiekit",
    url: adminUrl,
    authorizationEndpoint: new URL("auth", adminUrl).href,
    introspectionEndpoint: new URL("auth/introspect", adminUrl).href,
    tokenEndpoint: new URL("auth/token", adminUrl).href,
    mongodbUrl: mongoUrl,
  },
  publication: {
    me: "https://blog.giersig.eu",
    postTypes: [
      {
        type: "article",
        name: "Artikel",
        post: {
          path: "src/posts/{slug}.md",
          url: "https://blog.giersig.eu/posts/{slug}/",
        },
      },
      {
        type: "note",
        name: "Notiz",
        post: {
          path: "src/notes/{slug}.md",
          url: "https://blog.giersig.eu/notes/{slug}/",
        },
      },
      {
        type: "bookmark",
        name: "Lesezeichen",
        post: {
          path: "src/bookmarks/{slug}.md",
          url: "https://blog.giersig.eu/bookmarks/{slug}/",
        },
      },
    ],
  },

  plugins: [
    "@indiekit/store-github",
    "@rmdes/indiekit-endpoint-posts",
    "@rmdes/indiekit-endpoint-auth",
    "@rmdes/indiekit-endpoint-share",
    "@rmdes/indiekit-endpoint-github",
    "@rmdes/indiekit-endpoint-webmention-io",
    "@rmdes/indiekit-endpoint-conversations",
    //"@rmdes/indiekit-endpoint-activitypub",
  ],
  "@indiekit/store-github": {
    user: "svemagie",
    repo: "blog",
    branch: "main",
  },
  "@rmdes/indiekit-endpoint-github": {
    token: process.env.GITHUB_TOKEN,
    user: "svemagie",
  },
  "@rmdes/indiekit-endpoint-webmention-io": {
    token: process.env.WEBMENTION_IO_TOKEN,
  },
    "@rmdes/indiekit-endpoint-conversations": {
    enabled: true,
  },
  "@rmdes/indiekit-endpoint-activitypub": {
    username: "blog.giersig.eu",
  },
};

