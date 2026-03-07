import { GitHubClient } from "../github-client.js";
import * as utils from "../utils.js";

/**
 * Fetch contributions using GitHub Search API
 * More reliable than Events API which has 90-day/300-event limits
 * @param {GitHubClient} client - GitHub client
 * @param {string} username - GitHub username
 * @param {number} limit - Max contributions to return
 * @returns {Promise<Array>} - Formatted contributions
 */
async function fetchContributionsFromSearch(client, username, limit = 10) {
  try {
    const [prsResult, issuesResult] = await Promise.all([
      client.getUserPRs(username, limit),
      client.getUserIssues(username, limit),
    ]);

    const prs = (prsResult.items || []).map((item) => ({
      type: "pr",
      title: utils.truncate(item.title),
      url: item.html_url,
      repo: item.repository_url?.split("/").slice(-2).join("/"),
      repoUrl: item.html_url?.split("/pull/")[0],
      number: item.number,
      date: item.created_at,
      state: item.state,
    }));

    const issues = (issuesResult.items || []).map((item) => ({
      type: "issue",
      title: utils.truncate(item.title),
      url: item.html_url,
      repo: item.repository_url?.split("/").slice(-2).join("/"),
      repoUrl: item.html_url?.split("/issues/")[0],
      number: item.number,
      date: item.created_at,
      state: item.state,
    }));

    // Combine, sort by date, and limit
    return [...prs, ...issues]
      .toSorted((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  } catch (error) {
    console.error("[contributions] Error fetching from search:", error.message);
    return [];
  }
}

/**
 * Display PRs and issues created by user
 * @type {import("express").RequestHandler}
 */
export const contributionsController = {
  async get(request, response, next) {
    try {
      const { username, token, cacheTtl, limits } =
        request.app.locals.application.githubConfig;

      if (!username) {
        return response.render("contributions", {
          title: response.locals.__("github.contributions.title"),
          error: { message: response.locals.__("github.error.noUsername") },
        });
      }

      const client = new GitHubClient({ token, cacheTtl });

      // Try events API first
      let contributions = [];
      try {
        const events = await client.getUserEvents(username, 100);
        contributions = utils.extractContributions(events);
      } catch (apiError) {
        console.log("[contributions] Events API error:", apiError.message);
      }

      // Fallback: use Search API if events didn't have contributions
      if (contributions.length === 0) {
        console.log("[contributions] Events API returned no contributions, using Search API");
        contributions = await fetchContributionsFromSearch(
          client,
          username,
          limits.contributions * 2
        );
      }

      contributions = contributions.slice(0, limits.contributions * 2);

      response.render("contributions", {
        title: response.locals.__("github.contributions.title"),
        actions: [],
        parent: {
          href: request.baseUrl,
          text: response.locals.__("github.title"),
        },
        contributions,
        username,
        mountPath: request.baseUrl,
      });
    } catch (error) {
      next(error);
    }
  },

  async api(request, response, next) {
    try {
      const { username, token, cacheTtl, limits } =
        request.app.locals.application.githubConfig;

      if (!username) {
        return response.status(400).json({ error: "No username configured" });
      }

      const client = new GitHubClient({ token, cacheTtl });

      // Try events API first
      let contributions = [];
      try {
        const events = await client.getUserEvents(username, 100);
        contributions = utils.extractContributions(events);
      } catch (apiError) {
        console.log("[contributions API] Events API error:", apiError.message);
      }

      // Fallback: use Search API if events didn't have contributions
      if (contributions.length === 0) {
        console.log("[contributions API] Events API returned no contributions, using Search API");
        contributions = await fetchContributionsFromSearch(
          client,
          username,
          limits.contributions
        );
      }

      response.json({ contributions: contributions.slice(0, limits.contributions) });
    } catch (error) {
      next(error);
    }
  },
};
