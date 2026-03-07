/**
 * h-card discovery for author photo enrichment
 *
 * When webmention.io returns empty author photos (common with IndieWeb
 * sites that only have h-cards on their homepage, not individual post pages),
 * this module fetches the source domain's homepage and parses the h-card
 * to find the author's photo and URL.
 *
 * Results are cached in MongoDB (7-day TTL) and in-memory (process lifetime)
 * to avoid redundant HTTP requests.
 */

// In-memory cache: domain -> { photoUrl, authorUrl } | null
const memoryCache = new Map();

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Discover author data (photo + URL) from a domain's homepage h-card
 * @param {string} domain - Domain to check (e.g., "crowdersoup.com")
 * @param {object} [cacheCollection] - MongoDB collection for persistent cache
 * @returns {Promise<{photoUrl: string|null, authorUrl: string|null}>}
 */
export async function discoverAuthorData(domain, cacheCollection) {
  if (!domain) return { photoUrl: null, authorUrl: null };

  // Check in-memory cache
  if (memoryCache.has(domain)) {
    return memoryCache.get(domain);
  }

  // Check MongoDB cache
  if (cacheCollection) {
    try {
      const cached = await cacheCollection.findOne({ domain });
      if (cached && !isExpired(cached.fetchedAt)) {
        const result = {
          photoUrl: cached.photoUrl || null,
          authorUrl: cached.authorUrl || null,
        };
        memoryCache.set(domain, result);
        return result;
      }
    } catch {
      // Cache read failure is non-fatal
    }
  }

  // Fetch and parse the homepage h-card
  let result = { photoUrl: null, authorUrl: null };
  try {
    result = await fetchHcardData(domain);
  } catch (error) {
    console.log(
      `[Webmentions] h-card discovery failed for ${domain}: ${error.message}`,
    );
  }

  // Store in caches
  memoryCache.set(domain, result);

  if (cacheCollection) {
    try {
      await cacheCollection.updateOne(
        { domain },
        {
          $set: {
            domain,
            photoUrl: result.photoUrl,
            authorUrl: result.authorUrl,
            fetchedAt: new Date().toISOString(),
          },
        },
        { upsert: true },
      );
    } catch {
      // Cache write failure is non-fatal
    }
  }

  return result;
}

/**
 * Fetch a domain's homepage and extract h-card data
 * @param {string} domain
 * @returns {Promise<{photoUrl: string|null, authorUrl: string|null}>}
 */
async function fetchHcardData(domain) {
  const baseUrl = `https://${domain}`;
  const response = await fetch(baseUrl, {
    headers: {
      accept: "text/html",
      "user-agent": "Indiekit-Webmention/1.0 (h-card discovery)",
    },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });

  if (!response.ok) {
    return { photoUrl: null, authorUrl: null };
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return { photoUrl: null, authorUrl: null };
  }

  const html = await response.text();
  return parseHcard(html, baseUrl);
}

/**
 * Parse h-card microformat from HTML to extract photo and URL
 * @param {string} html - Page HTML
 * @param {string} baseUrl - Base URL for resolving relative URLs
 * @returns {{photoUrl: string|null, authorUrl: string|null}}
 */
export function parseHcard(html, baseUrl) {
  let photoUrl = null;
  let authorUrl = null;

  // Find u-photo images and u-url links in the page.
  // These are microformat-specific class names that are unlikely to
  // appear outside h-card context.
  photoUrl = findUPhoto(html);
  authorUrl = findUUrl(html);

  // Resolve relative URLs
  if (photoUrl) {
    photoUrl = resolveUrl(photoUrl, baseUrl);
  }
  if (authorUrl) {
    authorUrl = resolveUrl(authorUrl, baseUrl);
  }

  return { photoUrl, authorUrl };
}

/**
 * Find u-photo value from img elements
 * @param {string} html
 * @returns {string|null}
 */
function findUPhoto(html) {
  const imgRegex = /<img\s[^>]*?>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];

    if (!hasClass(tag, "u-photo")) continue;

    const src = getAttr(tag, "src");
    if (src) return src;
  }

  return null;
}

/**
 * Find u-url or u-uid value from anchor elements
 * @param {string} html
 * @returns {string|null}
 */
function findUUrl(html) {
  const aRegex = /<a\s[^>]*?>/gi;
  let match;

  while ((match = aRegex.exec(html)) !== null) {
    const tag = match[0];

    if (!hasClass(tag, "u-url") && !hasClass(tag, "u-uid")) continue;

    const href = getAttr(tag, "href");
    if (href) return href;
  }

  return null;
}

/**
 * Check if an HTML tag has a specific class
 * @param {string} tag - HTML tag string
 * @param {string} className - Class to check for
 * @returns {boolean}
 */
function hasClass(tag, className) {
  const classMatch = tag.match(/class=["']([^"']*)["']/i);
  if (!classMatch) return false;
  return classMatch[1].split(/\s+/).includes(className);
}

/**
 * Get an attribute value from an HTML tag
 * @param {string} tag - HTML tag string
 * @param {string} attr - Attribute name
 * @returns {string|null}
 */
function getAttr(tag, attr) {
  const regex = new RegExp(`${attr}=["']([^"']*)["']`, "i");
  const match = tag.match(regex);
  return match ? match[1] : null;
}

/**
 * Resolve a potentially relative URL against a base
 * @param {string} url
 * @param {string} base
 * @returns {string}
 */
function resolveUrl(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/**
 * Check if a cached entry has expired
 * @param {string} fetchedAt - ISO timestamp
 * @returns {boolean}
 */
function isExpired(fetchedAt) {
  if (!fetchedAt) return true;
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age > CACHE_TTL_MS;
}

/**
 * Clear the in-memory cache (useful for testing)
 */
export function clearMemoryCache() {
  memoryCache.clear();
}
