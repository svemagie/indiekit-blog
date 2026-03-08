import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const funkwhaleInstance = process.env.FUNKWHALE_INSTANCE;
const funkwhaleUsername = process.env.FUNKWHALE_USERNAME;
const funkwhaleToken = process.env.FUNKWHALE_TOKEN;
const lastfmApiKey = process.env.LASTFM_API_KEY;
const lastfmUsername = process.env.LASTFM_USERNAME;
const publicationBaseUrl = (
  process.env.PUBLICATION_URL ||
  process.env.SITE_URL ||
  "https://blog.giersig.eu"
).replace(/\/+$/, "");
const publicationHostname = (() => {
  try {
    return new URL(publicationBaseUrl).hostname;
  } catch {
    return "";
  }
})();
const nodeEnv = (process.env.NODE_ENV || "production").toLowerCase();
const debugEnabled = process.env.INDIEKIT_DEBUG === "1" || nodeEnv !== "production";
const siteName = process.env.SITE_NAME || "Indiekit";
const authorName = process.env.AUTHOR_NAME || "";
const authorBio = process.env.AUTHOR_BIO || "";
const authorAvatar = (() => {
  const avatar = (process.env.AUTHOR_AVATAR || "").trim();

  if (!avatar) {
    return "";
  }

  try {
    return new URL(avatar, publicationBaseUrl).href;
  } catch {
    return "";
  }
})();
const activityPubHandle = (
  process.env.AP_HANDLE ||
  process.env.ACTIVITYPUB_HANDLE ||
  githubUsername ||
  publicationHostname.split(".")[0] ||
  "user"
)
  .trim()
  .replace(/^@+/, "")
  .split("@")[0];
const activityPubLogLevel = (process.env.AP_LOG_LEVEL || "info").toLowerCase();
const activityPubDebugDashboard =
  process.env.AP_DEBUG === "1" || process.env.AP_DEBUG === "true";
const activityPubDebugPassword = process.env.AP_DEBUG_PASSWORD || "";
const activityPubAlsoKnownAs = process.env.AP_ALSO_KNOWN_AS || "";
const redisUrl = process.env.REDIS_URL || "";
const configDir = path.dirname(fileURLToPath(import.meta.url));
const homepageContentDir =
  process.env.HOMEPAGE_CONTENT_DIR ||
  process.env.CONTENT_DIR ||
  path.join(configDir, "content");

let webmentionDomain = process.env.WEBMENTION_IO_DOMAIN;
if (!webmentionDomain) {
  try {
    webmentionDomain = new URL(publicationBaseUrl).hostname;
  } catch {
    webmentionDomain = "blog.giersig.eu";
  }
}

export default {
  ...(debugEnabled && { debug: process.env.DEBUG || "indiekit:*" }),
  application: {
    name: "Indiekit",
    mongodbUrl: mongoUrl,
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
      repost: {
        name: "Repost",
        post: {
          path: "content/reposts/{slug}.md",
          url: `${publicationBaseUrl}/reposts/{slug}/`,
        },
      },
      photo: {
        name: "Foto",
        post: {
          path: "content/photos/{slug}.md",
          url: `${publicationBaseUrl}/photos/{slug}/`,
        },
        media: {
          path: "images/{filename}",
          url: `${publicationBaseUrl}/images/{filename}`,
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
    "@indiekit/post-type-repost",
    "@rmdes/indiekit-post-type-page",
    "@rmdes/indiekit-preset-eleventy",
    "@rmdes/indiekit-endpoint-github",
    "@rmdes/indiekit-endpoint-webmention-io",
    "@rmdes/indiekit-endpoint-homepage",
    "@rmdes/indiekit-endpoint-conversations",
    "@rmdes/indiekit-endpoint-funkwhale",
    "@rmdes/indiekit-endpoint-lastfm",
    "@rmdes/indiekit-endpoint-activitypub",
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
  "@indiekit/post-type-repost": {
    name: "Repost",
  },
  "@rmdes/indiekit-endpoint-github": {
    token: githubActivityToken,
    username: githubUsername,
  },
  "@rmdes/indiekit-endpoint-webmention-io": {
    token: process.env.WEBMENTION_IO_TOKEN,
    domain: webmentionDomain,
  },
  "@rmdes/indiekit-endpoint-homepage": {
    mountPath: "/homepage",
    contentDir: homepageContentDir,
  },
  "@rmdes/indiekit-endpoint-conversations": {
    mountPath: "/conversations",
  },
  "@rmdes/indiekit-endpoint-funkwhale": {
    mountPath: "/funkwhale",
    instanceUrl: funkwhaleInstance,
    username: funkwhaleUsername,
    token: funkwhaleToken,
  },
  "@rmdes/indiekit-endpoint-lastfm": {
    mountPath: "/lastfmapi",
    apiKey: lastfmApiKey,
    username: lastfmUsername,
  },
  "@rmdes/indiekit-endpoint-activitypub": {
    mountPath: "/activitypub",
    actor: {
      handle: activityPubHandle,
      name: authorName || siteName,
      summary: authorBio || process.env.SITE_DESCRIPTION || "",
      icon: authorAvatar,
    },
    checked: true,
    alsoKnownAs: activityPubAlsoKnownAs,
    activityRetentionDays: 90,
    storeRawActivities: false,
    redisUrl,
    parallelWorkers: 5,
    actorType: "Person",
    logLevel: activityPubLogLevel,
    debugDashboard: activityPubDebugDashboard,
    debugPassword: activityPubDebugPassword,
  },
};

