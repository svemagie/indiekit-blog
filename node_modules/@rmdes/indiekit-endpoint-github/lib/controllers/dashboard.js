import { GitHubClient } from "../github-client.js";
import * as utils from "../utils.js";

/**
 * Fetch commits from user's recently pushed repos
 * Used as fallback when Events API doesn't include commit details
 * @param {GitHubClient} client - GitHub client
 * @param {string} username - GitHub username
 * @param {number} limit - Max commits to return
 * @returns {Promise<Array>} - Formatted commits
 */
async function fetchCommitsFromRepos(client, username, limit = 10) {
  try {
    const repos = await client.getUserRepos(username, 8, "pushed");
    if (!Array.isArray(repos) || repos.length === 0) {
      return [];
    }

    const commitPromises = repos.slice(0, 5).map(async (repo) => {
      try {
        const repoCommits = await client.getRepoCommits(
          repo.owner?.login || username,
          repo.name,
          5,
        );
        return repoCommits.map((c) => ({
          sha: c.sha.slice(0, 7),
          message: utils.truncate(c.commit?.message?.split("\n")[0]),
          url: c.html_url,
          repo: repo.full_name,
          repoUrl: repo.html_url,
          date: c.commit?.author?.date || c.commit?.committer?.date,
          author: c.commit?.author?.name,
        }));
      } catch {
        return [];
      }
    });

    const commitResults = await Promise.all(commitPromises);
    return commitResults
      .flat()
      .toSorted((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  } catch (error) {
    console.error("[GitHub] Error fetching commits from repos:", error.message);
    return [];
  }
}

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

    return [...prs, ...issues]
      .toSorted((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  } catch (error) {
    console.error("[GitHub] Error fetching contributions:", error.message);
    return [];
  }
}

/**
 * Display GitHub activity dashboard
 * @type {import("express").RequestHandler}
 */
export const dashboardController = {
  async get(request, response, next) {
    try {
      const { githubConfig } = request.app.locals.application;

      if (!githubConfig) {
        return response.status(500).render("github", {
          title: "GitHub",
          actions: [],
          error: { message: "GitHub endpoint not configured correctly" },
        });
      }

      const { username, token, cacheTtl, limits, featuredRepos } = githubConfig;

      if (!username) {
        return response.render("github", {
          title: response.locals.__("github.title"),
          actions: [],
          error: { message: response.locals.__("github.error.noUsername") },
        });
      }

      const client = new GitHubClient({ token, cacheTtl });

      let user;
      let events = [];
      let starred = [];
      let repos = [];

      try {
        [user, events, starred, repos] = await Promise.all([
          client.getUser(username),
          client.getUserEvents(username, 30),
          client.getUserStarred(username, limits.stars),
          client.getUserRepos(username, limits.repos || 10),
        ]);
      } catch (apiError) {
        console.error("[GitHub] API error:", apiError.message);
        return response.render("github", {
          title: response.locals.__("github.title"),
          actions: [],
          error: { message: apiError.message || "Failed to fetch GitHub data" },
        });
      }

      let commits = utils.extractCommits(events);

      // Fallback: fetch commits directly from repos if events didn't have them
      if (commits.length === 0) {
        commits = await fetchCommitsFromRepos(client, username, limits.commits || 10);
      }

      let contributions = utils.extractContributions(events);

      // Fallback: use Search API if events didn't have contributions
      if (contributions.length === 0) {
        contributions = await fetchContributionsFromSearch(client, username, limits.contributions || 10);
      }

      const stars = utils.formatStarred(starred);
      const repositories = utils.formatRepos(repos);

      // Fetch commits from featured repos
      let featured = [];
      if (featuredRepos && featuredRepos.length > 0) {
        const featuredPromises = featuredRepos.map(async (repoPath) => {
          const [owner, repo] = repoPath.split("/");
          try {
            const [repoData, repoCommits] = await Promise.all([
              client.getRepo(owner, repo),
              client.getRepoCommits(owner, repo, 5),
            ]);
            return {
              ...utils.formatRepos([repoData])[0],
              commits: repoCommits.map((c) => ({
                sha: c.sha.slice(0, 7),
                message: utils.truncate(c.commit.message.split("\n")[0], 60),
                url: c.html_url,
                author: c.commit.author.name,
                date: c.commit.author.date,
              })),
            };
          } catch (error) {
            console.error(`[GitHub] Error fetching ${repoPath}:`, error.message);
            return null;
          }
        });
        featured = (await Promise.all(featuredPromises)).filter(Boolean);
      }

      response.render("github", {
        title: response.locals.__("github.title"),
        actions: [],
        user,
        commits: commits.slice(0, limits.commits || 10),
        contributions: contributions.slice(0, limits.contributions || 5),
        stars: stars.slice(0, limits.stars || 20),
        repositories: repositories.slice(0, limits.repos || 10),
        featured,
        mountPath: request.baseUrl,
      });
    } catch (error) {
      console.error("[GitHub] Unexpected error:", error);
      next(error);
    }
  },
};
