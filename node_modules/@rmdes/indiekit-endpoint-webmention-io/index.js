import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { dashboardController } from "./lib/controllers/dashboard.js";
import { blocklistController } from "./lib/controllers/blocklist.js";
import { syncController } from "./lib/controllers/sync-controller.js";
import { apiController } from "./lib/controllers/api.js";
import { startSync, stopSync } from "./lib/sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const protectedRouter = express.Router();
const publicRouter = express.Router();

const defaults = {
  mountPath: "/webmentions",
  syncInterval: 900_000, // 15 minutes
  cacheTtl: 60, // seconds for public API Cache-Control
};

export default class WebmentionEndpoint {
  name = "Webmention moderation endpoint";

  constructor(options = {}) {
    this.options = { ...defaults, ...options };
    this.mountPath = this.options.mountPath;
  }

  get localesDirectory() {
    return path.join(__dirname, "locales");
  }

  get viewsDirectory() {
    return path.join(__dirname, "views");
  }

  get navigationItems() {
    return {
      href: this.options.mountPath,
      text: "webmention-io.title",
      requiresDatabase: true,
    };
  }

  /**
   * Protected routes (require authentication)
   * Admin dashboard, moderation, sync controls
   */
  get routes() {
    // Dashboard — paginated webmention list with moderation
    protectedRouter.get("/", dashboardController.list);

    // Blocklist management page
    protectedRouter.get("/blocklist", blocklistController.list);

    // Sync controls
    protectedRouter.post("/sync", syncController.sync);
    protectedRouter.post("/sync/full", syncController.fullSync);

    // Moderation actions
    protectedRouter.post("/:wmId/hide", dashboardController.hide);
    protectedRouter.post("/:wmId/unhide", dashboardController.unhide);

    // Block a domain (hides all mentions + adds to blocklist)
    protectedRouter.post("/block", dashboardController.blockDomainHandler);

    // Unblock a domain
    protectedRouter.post(
      "/blocklist/:domain/delete",
      blocklistController.unblock,
    );

    // Privacy removal (permanent delete + block)
    protectedRouter.post("/privacy-remove", dashboardController.privacyRemove);

    return protectedRouter;
  }

  /**
   * Public routes (no authentication required)
   * JF2 JSON API — drop-in replacement for webmention.io proxy
   */
  get routesPublic() {
    publicRouter.get("/api/mentions", apiController.getMentions);

    return publicRouter;
  }

  init(Indiekit) {
    Indiekit.addEndpoint(this);

    // Add MongoDB collections
    Indiekit.addCollection("webmentions");
    Indiekit.addCollection("webmentionBlocklist");

    // Store config in application for controller access
    Indiekit.config.application.webmentionConfig = this.options;
    Indiekit.config.application.webmentionEndpoint = this.mountPath;

    // Store database getter for controller access
    Indiekit.config.application.getWebmentionDb = () => Indiekit.database;

    // Start background sync if database is available
    if (Indiekit.config.application.mongodbUrl) {
      startSync(Indiekit, this.options);
    }
  }

  destroy() {
    stopSync();
  }
}
