import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-github/lib/controllers/changelog.js",
];

// Marker: present once the patch has already been applied
const marker = "function categorizeCommit(title)";

// ── Part 1: replace categorizeRepo + CATEGORY_LABELS ─────────────────────────

const oldCategorize = `function categorizeRepo(name) {
  if (name === "indiekit") return "core";
  if (name === "indiekit-cloudron" || name === "indiekit-deploy")
    return "deployment";
  if (name.includes("theme")) return "theme";
  if (name.startsWith("indiekit-endpoint-")) return "endpoints";
  if (name.startsWith("indiekit-syndicator-")) return "syndicators";
  if (name.startsWith("indiekit-post-type-")) return "post-types";
  if (name.startsWith("indiekit-preset-")) return "presets";
  return "other";
}

const CATEGORY_LABELS = {
  core: "Core",
  deployment: "Deployment",
  theme: "Theme",
  endpoints: "Endpoints",
  syndicators: "Syndicators",
  "post-types": "Post Types",
  presets: "Presets",
  other: "Other",
};`;

const newCategorize = `function categorizeCommit(title) {
  if (/^feat[:(]/i.test(title)) return "features";
  if (/^fix[:(]/i.test(title)) return "fixes";
  if (/^perf[:(]/i.test(title)) return "performance";
  if (/^a11y[:(]/i.test(title)) return "accessibility";
  if (/^docs[:(]/i.test(title)) return "documentation";
  if (/^chore[:(]/i.test(title)) return "chores";
  if (/^refactor[:(]/i.test(title)) return "refactor";
  return "other";
}

const CATEGORY_LABELS = {
  features: "Features",
  fixes: "Fixes",
  performance: "Performance",
  accessibility: "Accessibility",
  documentation: "Documentation",
  chores: "Chores",
  refactor: "Refactor",
  other: "Other",
};`;

// ── Part 2: replace repo-based category map builder ──────────────────────────

const oldBuildCategories = `      // Build categories map from discovered repos
      const categories = {};
      for (const repo of indiekitRepos) {
        const cat = categorizeRepo(repo.name);
        if (!categories[cat]) {
          categories[cat] = {
            label: CATEGORY_LABELS[cat] || cat,
            repos: [],
          };
        }
        categories[cat].repos.push(repo.name);
      }`;

const newBuildCategories = `      // Static categories map (commit-message based)
      const categories = {};
      for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
        categories[key] = { label, repos: [] };
      }`;

// ── Part 3: replace per-commit category assignment ───────────────────────────

const oldCommitCategory = `                  category: categorizeRepo(repo.name),`;
const newCommitCategory = `                  category: categorizeCommit(c.commit.message.split("\\n")[0]),`;

async function exists(path) {
  try {
    await access(path);
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

  if (source.includes(marker)) {
    console.log("[postinstall] endpoint-github changelog categories already patched");
    continue;
  }

  if (
    !source.includes(oldCategorize) ||
    !source.includes(oldBuildCategories) ||
    !source.includes(oldCommitCategory)
  ) {
    console.log("[postinstall] endpoint-github changelog: unexpected source layout, skipping");
    continue;
  }

  const updated = source
    .replace(oldCategorize, newCategorize)
    .replace(oldBuildCategories, newBuildCategories)
    .replace(oldCommitCategory, newCommitCategory);

  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-github changelog file found");
} else if (patched > 0) {
  console.log(
    `[postinstall] Patched endpoint-github changelog categories in ${patched} file(s)`,
  );
}
