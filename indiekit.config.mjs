import "dotenv/config";

const mongoUsername =
  process.env.MONGO_USERNAME || process.env.MONGO_USER || "indiekit";
const mongoPassword = process.env.MONGO_PASSWORD || "";
const mongoHost = process.env.MONGO_HOST || "10.100.0.20";
const mongoPort = process.env.MONGO_PORT || "27017";
const mongoDatabase =
  process.env.MONGO_DATABASE || process.env.MONGO_DB || "indiekit";
const mongoAuthSource = process.env.MONGO_AUTH_SOURCE || "admin";
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

const githubUsername = process.env.GITHUB_USERNAME || "svemagie";
const githubContentToken =
  process.env.GH_CONTENT_TOKEN || process.env.GITHUB_TOKEN;
const githubActivityToken =
  process.env.GH_ACTIVITY_TOKEN || process.env.GITHUB_TOKEN;

export default {
  debug: "indiekit:*",
  application: {
    name: "Indiekit",
    mongodbUrl: mongoUrl,
  },
  publication: {
    me: "https://blog.giersig.eu",
    postTypes: {
      article: {
        name: "Artikel",
        post: {
          path: "src/posts/{slug}.md",
          url: "https://blog.giersig.eu/posts/{slug}/",
        },
      },
      note: {
        name: "Notiz",
        post: {
          path: "src/notes/{slug}.md",
          url: "https://blog.giersig.eu/notes/{slug}/",
        },
      },
      bookmark: {
        name: "Lesezeichen",
        post: {
          path: "src/bookmarks/{slug}.md",
          url: "https://blog.giersig.eu/bookmarks/{slug}/",
        },
      },
    },
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
    user: githubUsername,
    repo: "blog",
    branch: "main",
    token: githubContentToken,
  },
  "@rmdes/indiekit-endpoint-posts": {
    mountPath: "/blog",
  },
  "@rmdes/indiekit-endpoint-github": {
    token: githubActivityToken,
    username: githubUsername,
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

