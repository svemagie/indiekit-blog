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
    // Get user's recently pushed repos (sorted by push date)
    const repos = await client.getUserRepos(username, 8, "pushed");

    if (!Array.isArray(repos) || repos.length === 0) {
      return [];
    }

    // Fetch recent commits from each repo in parallel
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
        // Skip repos we can't access (private without token, etc.)
        return [];
      }
    });

    const commitResults = await Promise.all(commitPromises);
    const allCommits = commitResults.flat();

    // Sort by date descending and return limited results
    return allCommits
      .toSorted((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  } catch (error) {
    console.error("[commits] Error fetching from repos:", error.message);
    return [];
  }
}

/**
 * Display commits list
 * @type {import("express").RequestHandler}
 */
export const commitsController = {
  async get(request, response, next) {
    try {
      const { username, token, cacheTtl, limits } =
        request.app.locals.application.githubConfig;

      if (!username) {
        return response.render("commits", {
          title: response.locals.__("github.commits.title"),
          error: { message: response.locals.__("github.error.noUsername") },
        });
      }

      const client = new GitHubClient({ token, cacheTtl });

      // Try events API first (includes commits when GitHub provides them)
      let commits = [];
      try {
        const events = await client.getUserEvents(username, 100);
        commits = utils.extractCommits(events);
      } catch (apiError) {
        console.error("[commits] GitHub Events API error:", apiError.message);
      }

      // Fallback: fetch commits directly from repos if events didn't have them
      if (commits.length === 0) {
        console.log(
          "[commits] Events API returned no commits, fetching from repos",
        );
        commits = await fetchCommitsFromRepos(
          client,
          username,
          limits.commits * 3,
        );
      }

      response.render("commits", {
        title: response.locals.__("github.commits.title"),
        actions: [],
        parent: {
          href: request.baseUrl,
          text: response.locals.__("github.title"),
        },
        commits: commits.slice(0, limits.commits * 3),
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

      // Try events API first (includes commits when GitHub provides them)
      let commits = [];
      try {
        const events = await client.getUserEvents(username, 50);
        commits = utils.extractCommits(events);
      } catch (apiError) {
        console.log("[commits API] Events API error:", apiError.message);
      }

      // Fallback: fetch commits directly from repos if events didn't have them
      if (commits.length === 0) {
        console.log(
          "[commits API] Events API returned no commits, fetching from repos",
        );
        commits = await fetchCommitsFromRepos(client, username, limits.commits);
      }

      response.json({ commits: commits.slice(0, limits.commits) });
    } catch (error) {
      next(error);
    }
  },
};
