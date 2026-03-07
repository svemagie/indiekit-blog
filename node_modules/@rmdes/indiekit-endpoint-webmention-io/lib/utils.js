import sanitize from "sanitize-html";

/**
 * Get mention type from `wm-property`
 * @param {string} wmProperty - Webmention.io `wm-property` value
 * @returns {string} Icon name
 */
export const getMentionType = (wmProperty) => {
  switch (true) {
    case wmProperty === "in-reply-to": {
      return "reply";
    }
    case wmProperty === "like-of": {
      return "like";
    }
    case wmProperty === "repost-of": {
      return "repost";
    }
    case wmProperty === "bookmark-of": {
      return "bookmark";
    }
    case wmProperty === "rsvp": {
      return "rsvp";
    }
    default: {
      return "mention";
    }
  }
};

const upperFirst = (string) => {
  return String(string).charAt(0).toUpperCase() + String(string).slice(1);
};

/**
 * Get mention title
 * @param {object} jf2 - JF2
 * @returns {string} Mention title
 */
export const getMentionTitle = (jf2) => {
  let type = getMentionType(jf2["wm-property"]);
  type = upperFirst(type).replace("Rsvp", "RSVP");

  return jf2.name || type;
};

/**
 * Get author name
 * @param {object} jf2 - JF2
 * @returns {string} Author name or URL fallback
 */
export const getAuthorName = (jf2) => {
  if (jf2.author?.name) return jf2.author.name;

  try {
    let url = jf2.author?.url || jf2.url;
    url = new URL(url);
    return url.hostname + url.pathname.replace(/\/$/, "");
  } catch {
    return "Unknown";
  }
};

/**
 * Normalise paragraphs
 * @param {string} html - HTML
 * @returns {string} HTML with normalised paragraphs
 */
export const normaliseParagraphs = (html) => {
  html = `<p>${html}</p>`;
  html = html.replaceAll(/<br\s*\/?>\s*<br\s*\/?>/g, "</p><p>");
  return html;
};

/**
 * Sanitise incoming mention HTML
 * @param {string} html - HTML
 * @returns {string} Sanitised HTML
 */
export const sanitiseHtml = (html) => {
  html = normaliseParagraphs(html);
  html = sanitize(html, {
    exclusiveFilter: function (frame) {
      return (
        (frame.tag === "a" &&
          frame.attribs?.href?.includes("brid.gy") &&
          !frame.text.trim()) ||
        (frame.tag === "p" && !frame.text.trim())
      );
    },
    transformTags: {
      h1: "h3",
      h2: "h4",
      h3: "h5",
      h4: "h6",
      h5: "h6",
      h6: "h6",
    },
  });

  return html;
};

/**
 * Ensure a value is an ISO 8601 date string.
 * MongoDB may auto-convert ISO strings to Date objects (BSON Date).
 * The Nunjucks `| date` filter calls `parseISO(string)` which crashes
 * on Date objects with `dateString.split is not a function`.
 * @param {*} value - Date object, ISO string, or null
 * @returns {string|null} ISO string or null
 */
export const ensureISOString = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
};

/**
 * Extract domain from a URL string
 * @param {string} url - URL
 * @returns {string|null} Domain or null
 */
export const extractDomain = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};
