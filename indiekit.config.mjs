const rawAdminUrl =
  process.env.INDIEKIT_ADMIN_URL || "https://blog.giersig.eu/admin/";
const adminUrl = new URL(
  rawAdminUrl.endsWith("/") ? rawAdminUrl : `${rawAdminUrl}/`,
).href;

export default {
  debug: "indiekit:*",
  application: {
    name: "Indiekit",
    url: adminUrl,
    authorizationEndpoint: new URL("auth", adminUrl).href,
    introspectionEndpoint: new URL("auth/introspect", adminUrl).href,
    tokenEndpoint: new URL("auth/token", adminUrl).href,
    mongodbUrl: `mongodb://indiekit:${process.env.MONGO_PASSWORD}@10.100.0.20:27017/indiekit`,
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

