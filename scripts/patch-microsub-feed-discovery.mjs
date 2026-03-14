/**
 * Patch: improve feed discovery in fetchAndParseFeed
 *
 * Problem: when a bookmarked URL is an HTML page (article, site root, etc.),
 * fetchAndParseFeed only tries a fixed list of common paths (/feed, /rss.xml …).
 * This misses sites whose feed URL is advertised via a
 *   <link rel="alternate" type="application/rss+xml" href="…">
 * tag in the page <head>.  For example, econsoc.mpifg.de, signal.org blog
 * pages, and Substack article URLs all work through <link> discovery but
 * fail the common-path probe.
 *
 * Solution: before falling back to tryCommonFeedPaths, call discoverFeeds()
 * (which already parses <link rel="alternate"> tags) on the fetched HTML
 * content.  If it finds a typed RSS/Atom/JSONFeed link, use that URL.
 * Only if link-based discovery also fails do we probe common paths.
 */
import { access, readFile, writeFile } from "node:fs/promises";

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const patchSpecs = [
  {
    name: "microsub-html-feed-discovery",
    marker: "link-based discovery from HTML",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-microsub/lib/feeds/fetcher.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-microsub/lib/feeds/fetcher.js",
    ],
    oldSnippet: `  // If we got ActivityPub or unknown, try common feed paths
  if (feedType === "activitypub" || feedType === "unknown") {
    const fallbackFeed = await tryCommonFeedPaths(url, options);
    if (fallbackFeed) {
      // Fetch and parse the discovered feed
      const feedResult = await fetchFeed(fallbackFeed.url, options);
      if (!feedResult.notModified) {
        const fallbackType = detectFeedType(feedResult.content, feedResult.contentType);
        const parsed = await parseFeed(feedResult.content, fallbackFeed.url, {
          contentType: feedResult.contentType,
        });
        return {
          ...feedResult,
          ...parsed,
          feedType: fallbackType,
          hub: feedResult.hub || parsed._hub,
          discoveredFrom: url,
        };
      }
    }
    throw new Error(
      \`Unable to find a feed at \${url}. Try the direct feed URL.\`,
    );
  }`,
    newSnippet: `  // If we got ActivityPub or unknown, try link-based discovery then common paths
  if (feedType === "activitypub" || feedType === "unknown") {
    // 1. link-based discovery from HTML: parse <link rel="alternate" type="application/rss+xml|atom+xml">
    let discoveredFeedUrl;
    if (result.content) {
      const { discoverFeeds } = await import("./hfeed.js");
      const discovered = await discoverFeeds(result.content, url);
      const rssOrAtom = discovered.find(
        (f) => f.type === "rss" || f.type === "atom" || f.type === "jsonfeed",
      );
      if (rssOrAtom) discoveredFeedUrl = rssOrAtom.url;
    }

    // 2. Fall back to common feed paths (/feed, /rss.xml, etc.)
    const fallbackFeed = discoveredFeedUrl
      ? { url: discoveredFeedUrl }
      : await tryCommonFeedPaths(url, options);

    if (fallbackFeed) {
      // Fetch and parse the discovered feed
      const feedResult = await fetchFeed(fallbackFeed.url, options);
      if (!feedResult.notModified) {
        const fallbackType = detectFeedType(feedResult.content, feedResult.contentType);
        const parsed = await parseFeed(feedResult.content, fallbackFeed.url, {
          contentType: feedResult.contentType,
        });
        return {
          ...feedResult,
          ...parsed,
          feedType: fallbackType,
          hub: feedResult.hub || parsed._hub,
          discoveredFrom: url,
        };
      }
    }
    throw new Error(
      \`Unable to find a feed at \${url}. Try the direct feed URL.\`,
    );
  }`,
  },
];

let filesChecked = 0;
let filesPatched = 0;

for (const spec of patchSpecs) {
  let foundAnyTarget = false;

  for (const filePath of spec.candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    filesChecked += 1;

    const source = await readFile(filePath, "utf8");

    if (source.includes(spec.marker)) {
      console.log(`[postinstall] ${spec.name}: already patched, skipping`);
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
      console.warn(
        `[postinstall] ${spec.name}: target snippet not found in ${filePath} — may have been updated upstream`,
      );
      continue;
    }

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);
    await writeFile(filePath, updated, "utf8");
    filesPatched += 1;
    console.log(`[postinstall] ${spec.name}: patched ${filePath}`);
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (filesChecked === 0) {
  console.log("[postinstall] No microsub fetcher files found");
} else if (filesPatched === 0) {
  console.log("[postinstall] microsub HTML feed discovery already patched");
} else {
  console.log(
    `[postinstall] Patched microsub HTML feed discovery in ${filesPatched}/${filesChecked} file(s)`,
  );
}
