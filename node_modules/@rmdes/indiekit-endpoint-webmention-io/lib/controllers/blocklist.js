/**
 * Blocklist controller
 */

import { getBlocklist, unblockDomain } from "../storage/blocklist.js";
import { unhideByDomain } from "../storage/webmentions.js";
import { ensureISOString } from "../utils.js";

export const blocklistController = {
  /**
   * GET /blocklist - Blocklist management page
   */
  async list(request, response) {
    const { application } = request.app.locals;

    try {
      const db = application.getWebmentionDb();
      let entries = [];

      if (db) {
        const collection = db.collection("webmentionBlocklist");
        const raw = await getBlocklist(collection);
        entries = raw.map((entry) => ({
          ...entry,
          blockedAt: ensureISOString(entry.blockedAt),
        }));
      }

      response.render("webmentions-blocklist", {
        title: response.locals.__("webmention-io.blocklist.title"),
        entries,
        wmEndpoint: application.webmentionEndpoint,
      });
    } catch (error) {
      console.error("[Webmentions] Blocklist error:", error);
      response.status(500).render("error", {
        title: "Error",
        message: "Failed to load blocklist",
        error: error.message,
      });
    }
  },

  /**
   * POST /blocklist/:domain/delete - Unblock a domain
   */
  async unblock(request, response) {
    const { application } = request.app.locals;

    try {
      const domain = decodeURIComponent(request.params.domain);
      const db = application.getWebmentionDb();
      const blockCollection = db.collection("webmentionBlocklist");
      const wmCollection = db.collection("webmentions");

      await unblockDomain(blockCollection, domain);

      // Unhide mentions that were hidden by blocklist (not manual or privacy)
      const unhidden = await unhideByDomain(wmCollection, domain);

      response.redirect(
        application.webmentionEndpoint + "/blocklist?unblocked=1&unhidden=" + unhidden,
      );
    } catch (error) {
      console.error("[Webmentions] Unblock error:", error);
      response.redirect(application.webmentionEndpoint + "/blocklist?error=unblock-failed");
    }
  },
};
