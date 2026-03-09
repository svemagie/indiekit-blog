import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-homepage/lib/controllers/dashboard.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-homepage/lib/controllers/dashboard.js",
];

const marker = "function parseSiteSocialFromEnv(rawValue)";

const oldHelpersBlock = `function parseSocialLinks(body) {
  const social = [];
  if (!body.social) return social;
  const entries = Array.isArray(body.social) ? body.social : Object.values(body.social);
  for (const entry of entries) {
    if (!entry || (!entry.name && !entry.url)) continue;
    social.push({
      name: entry.name || "",
      url: entry.url || "",
      rel: entry.rel || "me",
      icon: entry.icon || "",
    });
  }
  return social;
}`;

const newHelpersBlock = `function parseSocialLinks(body) {
  const social = [];
  if (!body.social) return social;
  const entries = Array.isArray(body.social) ? body.social : Object.values(body.social);
  for (const entry of entries) {
    if (!entry || (!entry.name && !entry.url)) continue;
    social.push({
      name: entry.name || "",
      url: entry.url || "",
      rel: entry.rel || "me",
      icon: entry.icon || "",
    });
  }
  return social;
}

function normalizeSiteSocialEnvValue(rawValue) {
  if (typeof rawValue !== "string") {
    return "";
  }

  let value = rawValue.trim();

  if (!value) {
    return "";
  }

  while (/^SITE_SOCIAL\s*=/i.test(value)) {
    value = value.replace(/^SITE_SOCIAL\s*=/i, "").trim();
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  } else {
    value = value.replace(/^["']+/, "").replace(/["']+$/, "").trim();
  }

  return value;
}

function parseSiteSocialFromEnv(rawValue) {
  const normalized = normalizeSiteSocialEnvValue(rawValue);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split("|").map((part) => part.trim());

      if (parts.length < 2) {
        return null;
      }

      const name = parts[0] || "";
      const url = parts[1] || "";
      let rel = "me";
      let icon = "";

      if (parts.length >= 4) {
        rel = parts[2] || "me";
        icon = parts.slice(3).join("|") || "";
      } else if (parts.length >= 3) {
        icon = parts[2] || "";
      }

      if (!name && !url) {
        return null;
      }

      return {
        name,
        url,
        rel,
        icon,
      };
    })
    .filter(Boolean);
}

function getIdentityDefaultsFromEnv() {
  return {
    name: (process.env.AUTHOR_NAME || "").trim(),
    avatar: (process.env.AUTHOR_AVATAR || "").trim(),
    title: "",
    pronoun: "",
    bio: (process.env.AUTHOR_BIO || "").trim(),
    description: (process.env.SITE_DESCRIPTION || "").trim(),
    locality: "",
    country: "",
    org: "",
    url: (process.env.PUBLICATION_URL || process.env.SITE_URL || "").trim(),
    email: "",
    keyUrl: "",
    categories: [],
    social: parseSiteSocialFromEnv(process.env.SITE_SOCIAL),
  };
}

function mergeIdentityDefaults(identity) {
  const defaults = getIdentityDefaultsFromEnv();

  if (!identity || typeof identity !== "object") {
    return defaults;
  }

  return {
    ...defaults,
    ...identity,
    categories: Array.isArray(identity.categories)
      ? identity.categories
      : defaults.categories,
    social: Array.isArray(identity.social) ? identity.social : defaults.social,
  };
}`;

const oldIdentityLine = "      const identity = config.identity || {};";
const newIdentityLine = "      const identity = mergeIdentityDefaults(config.identity);";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let checked = 0;
let patched = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  checked += 1;

  const source = await readFile(filePath, "utf8");
  let updated = source;
  let changed = false;

  if (!updated.includes(marker)) {
    if (!updated.includes(oldHelpersBlock)) {
      continue;
    }

    updated = updated.replace(oldHelpersBlock, newHelpersBlock);
    changed = true;
  }

  if (!updated.includes(newIdentityLine)) {
    if (!updated.includes(oldIdentityLine)) {
      continue;
    }

    updated = updated.replace(oldIdentityLine, newIdentityLine);
    changed = true;
  }

  if (!changed) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-homepage dashboard controllers found");
} else if (patched === 0) {
  console.log("[postinstall] endpoint-homepage identity defaults already patched");
} else {
  console.log(
    `[postinstall] Patched endpoint-homepage identity defaults in ${patched} file(s)`,
  );
}
