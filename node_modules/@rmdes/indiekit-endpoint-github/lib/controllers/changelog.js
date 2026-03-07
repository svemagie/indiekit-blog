import { GitHubClient } from "../github-client.js";

/**
 * Categorize a repo by its name prefix
 * @param {string} name - Repository name
 * @returns {string} - Category key
 */
function categorizeRepo(name) {
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
};

/**
 * Split an array into chunks of a given size
 * @param {Array} array
 * @param {number} size
 * @returns {Array<Array>}
 */
function chunks(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Changelog API controller
 * @type {import("express").RequestHandler}
 */
export const changelogController = {
  async api(request, response, next) {
    try {
      const { username, token, cacheTtl } =
        request.app.locals.application.githubConfig;

      if (!username) {
        return response.status(400).json({ error: "No username configured" });
      }

      const client = new GitHubClient({ token, cacheTtl });

      // Parse days param — default 30, "all" for unlimited
      const daysParam = request.query.days || "30";
      let sinceDate = null;
      let daysValue = daysParam;

      if (daysParam !== "all") {
        const days = Number.parseInt(daysParam, 10);
        if (Number.isNaN(days) || days < 1) {
          return response
            .status(400)
            .json({ error: "Invalid days parameter" });
        }
        daysValue = days;
        const since = new Date();
        since.setDate(since.getDate() - days);
        sinceDate = since.toISOString();
      }

      // Fetch all user repos (100 to cover all indiekit repos)
      const repos = await client.getUserRepos(username, 100, "pushed");

      if (!Array.isArray(repos)) {
        return response.json({
          commits: [],
          categories: {},
          totalCommits: 0,
          days: daysValue,
          generatedAt: new Date().toISOString(),
        });
      }

      // Filter to indiekit repos only
      const indiekitRepos = repos.filter((repo) =>
        repo.name.includes("indiekit"),
      );

      // Build categories map from discovered repos
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
      }

      // Fetch commits in batches of 5 to avoid secondary rate limits
      const allCommits = [];
      for (const batch of chunks(indiekitRepos, 5)) {
        const results = await Promise.all(
          batch.map(async (repo) => {
            try {
              const commits = await client.getRepoCommits(
                repo.owner.login,
                repo.name,
                20,
                sinceDate,
              );

              if (!Array.isArray(commits)) return [];

              // Filter out merge commits and map to response shape
              return commits
                .filter((c) => (c.parents?.length || 0) <= 1)
                .map((c) => ({
                  sha: c.sha.slice(0, 7),
                  fullSha: c.sha,
                  title: c.commit.message.split("\n")[0],
                  body: c.commit.message.split("\n").slice(1).join("\n").trim(),
                  url: c.html_url,
                  date:
                    c.commit.author?.date || c.commit.committer?.date || null,
                  author: c.commit.author?.name || "Unknown",
                  repo: repo.full_name,
                  repoName: repo.name,
                  repoUrl: repo.html_url,
                  category: categorizeRepo(repo.name),
                }));
            } catch {
              return [];
            }
          }),
        );
        allCommits.push(...results.flat());
      }

      // Sort by date descending
      allCommits.sort(
        (a, b) => new Date(b.date || 0) - new Date(a.date || 0),
      );

      response.json({
        commits: allCommits,
        categories,
        totalCommits: allCommits.length,
        days: daysValue,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },
};
