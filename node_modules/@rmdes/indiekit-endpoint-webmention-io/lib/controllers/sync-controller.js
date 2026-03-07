/**
 * Sync controller - manual sync triggers
 */

import { runSync, runFullSync } from "../sync.js";

export const syncController = {
  /**
   * POST /sync - Trigger incremental sync
   */
  async sync(request, response) {
    const { application } = request.app.locals;

    try {
      const db = application.getWebmentionDb();
      const options = application.webmentionConfig || {};
      const result = await runSync(db, options);

      if (result.error) {
        response.redirect(application.webmentionEndpoint + "?error=" + encodeURIComponent(result.error));
      } else {
        response.redirect(application.webmentionEndpoint + "?synced=1&added=" + result.mentionsAdded);
      }
    } catch (error) {
      console.error("[Webmentions] Manual sync error:", error);
      response.redirect(application.webmentionEndpoint + "?error=sync-failed");
    }
  },

  /**
   * POST /sync/full - Trigger full re-sync
   */
  async fullSync(request, response) {
    const { application } = request.app.locals;

    try {
      const db = application.getWebmentionDb();
      const options = application.webmentionConfig || {};
      const result = await runFullSync(db, options);

      if (result.error) {
        response.redirect(application.webmentionEndpoint + "?error=" + encodeURIComponent(result.error));
      } else {
        response.redirect(application.webmentionEndpoint + "?synced=1&added=" + result.mentionsAdded);
      }
    } catch (error) {
      console.error("[Webmentions] Full sync error:", error);
      response.redirect(application.webmentionEndpoint + "?error=sync-failed");
    }
  },
};
