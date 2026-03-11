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
const listeningCacheTtlRaw = Number.parseInt(
  process.env.LISTENING_CACHE_TTL || "120000",
  10,
);
const listeningCacheTtl = Number.isFinite(listeningCacheTtlRaw)
  ? Math.max(30000, listeningCacheTtlRaw)
  : 120000;
const listeningSyncIntervalRaw = Number.parseInt(
  process.env.LISTENING_SYNC_INTERVAL || "180000",
  10,
);
const listeningSyncInterval = Number.isFinite(listeningSyncIntervalRaw)
  ? Math.max(60000, listeningSyncIntervalRaw)
  : 180000;
const funkwhaleCacheTtlRaw = Number.parseInt(
  process.env.FUNKWHALE_CACHE_TTL || String(listeningCacheTtl),
  10,
);
const funkwhaleCacheTtl = Number.isFinite(funkwhaleCacheTtlRaw)
  ? Math.max(30000, funkwhaleCacheTtlRaw)
  : listeningCacheTtl;
const funkwhaleSyncIntervalRaw = Number.parseInt(
  process.env.FUNKWHALE_SYNC_INTERVAL || String(listeningSyncInterval),
  10,
);
const funkwhaleSyncInterval = Number.isFinite(funkwhaleSyncIntervalRaw)
  ? Math.max(60000, funkwhaleSyncIntervalRaw)
  : listeningSyncInterval;
const lastfmCacheTtlRaw = Number.parseInt(
  process.env.LASTFM_CACHE_TTL || String(listeningCacheTtl),
  10,
);
const lastfmCacheTtl = Number.isFinite(lastfmCacheTtlRaw)
  ? Math.max(30000, lastfmCacheTtlRaw)
  : listeningCacheTtl;
const lastfmSyncIntervalRaw = Number.parseInt(
  process.env.LASTFM_SYNC_INTERVAL || String(listeningSyncInterval),
  10,
);
const lastfmSyncInterval = Number.isFinite(lastfmSyncIntervalRaw)
  ? Math.max(60000, lastfmSyncIntervalRaw)
  : listeningSyncInterval;
const blueskyHandle = (process.env.BLUESKY_HANDLE || "")
  .trim()
  .replace(/^@+/, "");
const blueskyPassword = process.env.BLUESKY_PASSWORD || "";
const mastodonUrl = process.env.MASTODON_URL || "https://troet.cafe";
const mastodonUser = (
  process.env.MASTODON_USER || process.env.MASTODON_USERNAME || ""
)
  .trim()
  .replace(/^@+/, "");
const mastodonAccessToken =
  process.env.MASTODON_ACCESS_TOKEN || process.env.MASTODON_TOKEN || "";
const syndicateMountPath =
  process.env.SYNDICATE_MOUNT_PATH || "/syndicate";
const publicationBaseUrl = (
  process.env.PUBLICATION_URL ||
  process.env.SITE_URL ||
  "https://blog.giersig.eu"
).replace(/\/+$/, "");
const applicationBaseUrl = (
  process.env.INDIEKIT_URL ||
  process.env.APPLICATION_URL ||
  publicationBaseUrl
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
const webmentionSenderMountPath =
  process.env.WEBMENTION_SENDER_MOUNT_PATH || "/webmention-sender";
const webmentionSenderTimeoutRaw = Number.parseInt(
  process.env.WEBMENTION_SENDER_TIMEOUT || "10000",
  10,
);
const webmentionSenderTimeout = Number.isFinite(webmentionSenderTimeoutRaw)
  ? webmentionSenderTimeoutRaw
  : 10000;
const webmentionSenderUserAgent =
  process.env.WEBMENTION_SENDER_USER_AGENT || `${siteName} Webmention Sender`;
const commentsMountPath = process.env.COMMENTS_MOUNT_PATH || "/comments";
const commentsRateLimitPerHourRaw = Number.parseInt(
  process.env.COMMENTS_RATE_LIMIT_PER_HOUR || "5",
  10,
);
const commentsRateLimitPerHour = Number.isFinite(commentsRateLimitPerHourRaw)
  ? commentsRateLimitPerHourRaw
  : 5;
const commentsRateLimitPerDayRaw = Number.parseInt(
  process.env.COMMENTS_RATE_LIMIT_PER_DAY || "20",
  10,
);
const commentsRateLimitPerDay = Number.isFinite(commentsRateLimitPerDayRaw)
  ? commentsRateLimitPerDayRaw
  : 20;
const commentsMaxLengthRaw = Number.parseInt(
  process.env.COMMENTS_MAX_LENGTH || "2000",
  10,
);
const commentsMaxLength = Number.isFinite(commentsMaxLengthRaw)
  ? commentsMaxLengthRaw
  : 2000;
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
const podrollMountPath = process.env.PODROLL_MOUNT_PATH || "/podrollapi";
const podrollEpisodesUrl = process.env.PODROLL_EPISODES_URL || "";
const podrollOpmlUrl = process.env.PODROLL_OPML_URL || "";
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
    url: applicationBaseUrl,
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
        fields: {
          aiTextLevel: {},
          aiCodeLevel: {},
          aiTools: {},
          aiDescription: {},
        },
      },
      note: {
        name: "Notiz",
        post: {
          path: "content/notes/{slug}.md",
          url: `${publicationBaseUrl}/notes/{slug}/`,
        },
        fields: {
          aiTextLevel: {},
          aiCodeLevel: {},
          aiTools: {},
          aiDescription: {},
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
    "@indiekit/endpoint-micropub",
    "@indiekit/store-github",
    "@indiekit/post-type-repost",
    "@rmdes/indiekit-post-type-page",
    "@rmdes/indiekit-syndicator-bluesky",
    "@rmdes/indiekit-syndicator-mastodon",
    "@rmdes/indiekit-syndicator-indienews",
    "@rmdes/indiekit-preset-eleventy",
    "@rmdes/indiekit-endpoint-github",
    "@rmdes/indiekit-endpoint-webmention-io",
    "@rmdes/indiekit-endpoint-webmention-sender",
    "@rmdes/indiekit-endpoint-homepage",
    "@rmdes/indiekit-endpoint-conversations",
    "@rmdes/indiekit-endpoint-comments",
    "@rmdes/indiekit-endpoint-funkwhale",
    "@rmdes/indiekit-endpoint-lastfm",
    "@rmdes/indiekit-endpoint-podroll",
    "@rmdes/indiekit-endpoint-activitypub",
    "@rmdes/indiekit-endpoint-youtube",
    "@rmdes/indiekit-endpoint-blogroll",
    "@rmdes/indiekit-endpoint-microsub",
  ],
  
  "@rmdes/indiekit-endpoint-auth": {
      mountPath: "/auth",
  },
  "@indiekit/endpoint-micropub": {
    mountPath: "/micropub",
  },
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
  "@rmdes/indiekit-syndicator-bluesky": {
    handle: blueskyHandle,
    password: blueskyPassword,
  },
  "@rmdes/indiekit-syndicator-mastodon": {
    url: mastodonUrl,
    user: mastodonUser,
    accessToken: mastodonAccessToken,
  },
  "@indiekit/endpoint-syndicate": {
    mountPath: syndicateMountPath,
  },
  "@rmdes/indiekit-endpoint-github": {
    token: githubActivityToken,
    username: githubUsername,
  },
  "@rmdes/indiekit-endpoint-webmention-io": {
    token: process.env.WEBMENTION_IO_TOKEN,
    domain: webmentionDomain,
  },
  "@rmdes/indiekit-endpoint-webmention-sender": {
    mountPath: webmentionSenderMountPath,
    timeout: webmentionSenderTimeout,
    userAgent: webmentionSenderUserAgent,
  },
  "@rmdes/indiekit-endpoint-homepage": {
    mountPath: "/homepage",
    contentDir: homepageContentDir,
  },
  "@rmdes/indiekit-endpoint-conversations": {
    mountPath: "/conversations",
  },
  "@rmdes/indiekit-endpoint-comments": {
    mountPath: commentsMountPath,
    rateLimit: {
      perHour: commentsRateLimitPerHour,
      perDay: commentsRateLimitPerDay,
    },
    maxLength: commentsMaxLength,
  },
  "@rmdes/indiekit-endpoint-funkwhale": {
    mountPath: "/funkwhale",
    instanceUrl: funkwhaleInstance,
    username: funkwhaleUsername,
    token: funkwhaleToken,
    cacheTtl: funkwhaleCacheTtl,
    syncInterval: funkwhaleSyncInterval,
  },
  "@rmdes/indiekit-endpoint-lastfm": {
    mountPath: "/lastfmapi",
    apiKey: lastfmApiKey,
    username: lastfmUsername,
    cacheTtl: lastfmCacheTtl,
    syncInterval: lastfmSyncInterval,
  },
  "@rmdes/indiekit-endpoint-podroll": {
    mountPath: podrollMountPath,
    episodesUrl: podrollEpisodesUrl,
    opmlUrl: podrollOpmlUrl,
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
    "@rmdes/indiekit-endpoint-youtube": {
      mountPath: "/youtube",
      apiKey: process.env.YOUTUBE_API_KEY,
      channelId: process.env.YOUTUBE_CHANNEL_ID,
      // OR use channel handle instead:
      // channelHandle: "@YourChannel",
      cacheTtl: 300_000,      // 5 minutes
      liveCacheTtl: 60_000,   // 1 minute for live status
      limits: {
        videos: 10,
      },
    },
    "@rmdes/indiekit-syndicator-indienews": {
      languages: ["en", "de"],
      checked: false
    },
    "@rmdes/indiekit-endpoint-blogroll": {
      mountPath: "/blogrollapi",
      syncInterval: 3600000,
      maxItemsPerBlog: 50,
      maxItemAge: 7,
      fetchTimeout: 15000,
    },
    "@rmdes/indiekit-endpoint-microsub": {
      mountPath: "/microsub",
    },
};

