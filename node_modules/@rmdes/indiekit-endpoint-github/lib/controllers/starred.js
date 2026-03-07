/**
 * Starred repositories API controller
 * Serves cached data from MongoDB for Eleventy build + live updates
 */

import {
  getAllStars,
  getRecentStars,
  getStarCount,
  getSyncState,
} from "../starred-cache.js";
import {
  runIncrementalSync,
  runFullSync,
  getStarredSyncStatus,
  syncListsManual,
} from "../starred-sync.js";

export const starredController = {
  /**
   * GET /api/starred/all — Public JSON API
   * Returns all cached starred repos with list metadata
   */
  async all(request, response, next) {
    try {
      const { application } = request.app.locals;
      const db = application.getGithubDb();

      if (!db) {
        return response.json({ stars: [], totalCount: 0, lastSync: null, listMeta: [] });
      }

      const collection = db.collection("github_stars");
      const [stars, totalCount, syncState] = await Promise.all([
        getAllStars(collection),
        getStarCount(collection),
        getSyncState(db),
      ]);

      response.json({
        stars,
        totalCount,
        lastSync: syncState.lastIncrementalSync || syncState.lastFullSync || null,
        listMeta: syncState.lists || [],
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/starred/recent?since=ISO — Public JSON API
   * Returns stars newer than the given timestamp (for live updates)
   */
  async recent(request, response, next) {
    try {
      const { application } = request.app.locals;
      const db = application.getGithubDb();

      const since = request.query.since;
      if (!since) {
        return response.status(400).json({ error: "Missing 'since' query parameter (ISO date)" });
      }

      if (!db) {
        return response.json({ stars: [], totalCount: 0 });
      }

      const collection = db.collection("github_stars");
      const [stars, totalCount] = await Promise.all([
        getRecentStars(collection, since),
        getStarCount(collection),
      ]);

      response.json({ stars, totalCount });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/starred/sync — Protected, triggers manual sync
   * Query param: ?full=true for full re-sync
   */
  async sync(request, response, next) {
    try {
      const { application } = request.app.locals;
      const db = application.getGithubDb();
      const config = application.githubConfig;

      if (!db) {
        return response.status(503).json({ error: "Database not available" });
      }

      if (!config.token) {
        return response.status(400).json({ error: "No GitHub token configured" });
      }

      const status = getStarredSyncStatus();
      if (status.syncing) {
        return response.status(409).json({ error: "Sync already in progress" });
      }

      const isFull = request.query.full === "true";

      // Run sync in background, respond immediately
      const syncFn = isFull ? runFullSync : runIncrementalSync;
      syncFn(db, config)
        .then(() => syncListsManual(db, config))
        .catch((err) => {
          console.error("[GitHub Stars] Manual sync error:", err.message);
        });

      response.json({
        message: `${isFull ? "Full" : "Incremental"} sync started`,
        currentStatus: getStarredSyncStatus(),
      });
    } catch (error) {
      next(error);
    }
  },
};
