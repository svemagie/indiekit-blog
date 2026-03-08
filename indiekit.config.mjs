import "dotenv/config";

const mongoUsername = process.env.MONGO_USERNAME || process.env.MONGO_USER || "";
const mongoPassword = process.env.MONGO_PASSWORD || "";
const mongoHost = process.env.MONGO_HOST || "10.100.0.20";
const mongoPort = process.env.MONGO_PORT || "27017";
const mongoDatabase =
  process.env.MONGO_DATABASE || process.env.MONGO_DB || "indiekit";
const mongoAuthSource = process.env.MONGO_AUTH_SOURCE || "admin";
const hasMongoUrl = Boolean(process.env.MONGO_URL);
const hasMongoCredentials = Boolean(mongoUsername && mongoPassword);
const preferMongoUrl = process.env.MONGO_PREFER_URL === "1";
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
const mongoUrlFromParts = `mongodb://${mongoCredentials}${mongoHost}:${mongoPort}/${mongoDatabase}${mongoQuery}`;
const mongoUrl =
  hasMongoUrl && (!hasMongoCredentials || preferMongoUrl)
    ? process.env.MONGO_URL
    : mongoUrlFromParts;

const githubUsername = process.env.GITHUB_USERNAME || "svemagie";
const githubContentToken =
  process.env.GH_CONTENT_TOKEN || process.env.GITHUB_TOKEN;
const githubActivityToken =
  process.env.GH_ACTIVITY_TOKEN || process.env.GITHUB_TOKEN;
const publicationBaseUrl = (
  process.env.PUBLICATION_URL || "https://blog.giersig.eu"
).replace(/\/+$/, "");
const adminBaseUrl = (process.env.INDIEKIT_ADMIN_URL || "")
  .trim()
  .replace(/\/+$/, "");

let webmentionDomain = process.env.WEBMENTION_IO_DOMAIN;
if (!webmentionDomain) {
  try {
    webmentionDomain = new URL(publicationBaseUrl).hostname;
  } catch {
    webmentionDomain = "blog.giersig.eu";
  }
}

export default {
  debug: "indiekit:*",
  application: {
    name: "Indiekit",
    mongodbUrl: mongoUrl,
    ...(adminBaseUrl && {
      url: adminBaseUrl,
      authorizationEndpoint: `${adminBaseUrl}/auth`,
      introspectionEndpoint: `${adminBaseUrl}/auth/introspect`,
      tokenEndpoint: `${adminBaseUrl}/auth/token`,
    }),
  },
  publication: {
    me: publicationBaseUrl,
    postTypes: {
      article: {
        name: "Artikel",
        post: {
          path: "content/articles/{slug}.md",
          url: `${publicationBaseUrl}/articles/{slug}/`,
        },
      },
      note: {
        name: "Notiz",
        post: {
          path: "content/notes/{slug}.md",
          url: `${publicationBaseUrl}/notes/{slug}/`,
        },
      },
      bookmark: {
        name: "Lesezeichen",
        post: {
          path: "content/bookmarks/{slug}.md",
          url: `${publicationBaseUrl}/bookmarks/{slug}/`,
        },
      },
      like: {
        name: "Like",
        post: {
          path: "content/likes/{slug}.md",
          url: `${publicationBaseUrl}/likes/{slug}/`,
        },
      },
      photo: {
        name: "Foto",
        post: {
          path: "content/photos/{slug}.md",
          url: `${publicationBaseUrl}/photos/{slug}/`,
        },
      },
      reply: {
        name: "Antwort",
        post: {
          path: "content/replies/{slug}.md",
          url: `${publicationBaseUrl}/replies/{slug}/`,
        },
      },
      page: {
        name: "Seite",
        post: {
          path: "content/pages/{slug}.md",
          url: `${publicationBaseUrl}/{slug}/`,
        },
      },
    },
  },

  plugins: [
    "@indiekit/store-github",
    "@rmdes/indiekit-post-type-page",
    "@rmdes/indiekit-preset-eleventy",
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
  "@indiekit/endpoint-posts": {
    mountPath: "/posts",
  },
  "@rmdes/indiekit-endpoint-github": {
    token: githubActivityToken,
    username: githubUsername,
  },
  "@rmdes/indiekit-endpoint-webmention-io": {
    token: process.env.WEBMENTION_IO_TOKEN,
    domain: webmentionDomain,
  },
  "@rmdes/indiekit-endpoint-conversations": {
    mountPath: "/conversations",
  },
  "@rmdes/indiekit-endpoint-activitypub": {
    username: "blog.giersig.eu",
  },
};

