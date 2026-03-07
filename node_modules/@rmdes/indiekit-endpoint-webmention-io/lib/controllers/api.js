/**
 * Public JSON API controller
 * Drop-in replacement for webmention.io API and the proxy plugin
 */

import { getWebmentions, documentToJf2 } from "../storage/webmentions.js";

export const apiController = {
  /**
   * GET /api/mentions - Public JF2 webmentions API
   */
  async getMentions(request, response) {
    try {
      const { application } = request.app.locals;
      const db = application.getWebmentionDb();

      if (!db) {
        return response.status(503).json({ error: "Database unavailable" });
      }

      const collection = db.collection("webmentions");

      const target = request.query.target || null;
      const wmProperty = request.query["wm-property"] || null;
      const perPage = Math.min(Number(request.query["per-page"]) || 50, 10000);
      const page = Number(request.query.page) || 0;

      const { items } = await getWebmentions(collection, {
        target,
        wmProperty,
        showHidden: false,
        page,
        perPage,
      });

      const children = items.map(documentToJf2);

      const cacheTtl = application.webmentionConfig?.cacheTtl || 60;
      response.set("Cache-Control", `public, max-age=${cacheTtl}`);

      response.json({
        type: "feed",
        name: "Webmentions",
        children,
      });
    } catch (error) {
      console.error("[Webmentions] API error:", error);
      response.status(500).json({ error: "Failed to fetch webmentions" });
    }
  },
};
