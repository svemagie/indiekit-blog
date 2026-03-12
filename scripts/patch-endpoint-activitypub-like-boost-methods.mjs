import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "activitypub-resolveAuthor-import",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
    ],
    replacements: [
      {
        oldSnippet: [
          "import { startBatchRefollow } from \"./lib/batch-refollow.js\";",
          "import { logActivity } from \"./lib/activity-log.js\";",
          "import { scheduleCleanup } from \"./lib/timeline-cleanup.js\";",
        ].join("\n"),
        newSnippet: [
          "import { startBatchRefollow } from \"./lib/batch-refollow.js\";",
          "import { logActivity } from \"./lib/activity-log.js\";",
          "import { resolveAuthor } from \"./lib/resolve-author.js\";",
          "import { scheduleCleanup } from \"./lib/timeline-cleanup.js\";",
        ].join("\n"),
      },
      {
        oldSnippet: [
          "      await this._collections.ap_following.deleteOne({ actorUrl }).catch(() => {});",
          "      return { ok: false, error: error.message };",
          "    }",
          "  }",
          "",
          "  /**",
          "   * Send an Update(Person) activity to all followers so remote servers",
        ].join("\n"),
        newSnippet: [
          "      await this._collections.ap_following.deleteOne({ actorUrl }).catch(() => {});",
          "      return { ok: false, error: error.message };",
          "    }",
          "  }",
          "",
          "  /**",
          "   * Send a native AP Like activity for a post URL (called programmatically,",
          "   * e.g. when a like is created via Micropub).",
          "   * @param {string} postUrl - URL of the post being liked",
          "   * @param {object} [collections] - MongoDB collections map (application.collections)",
          "   * @returns {Promise<{ok: boolean, error?: string}>}",
          "   */",
          "  async likePost(postUrl, collections) {",
          "    if (!this._federation) {",
          "      return { ok: false, error: \"Federation not initialized\" };",
          "    }",
          "",
          "    try {",
          "      const { Like } = await import(\"@fedify/fedify/vocab\");",
          "      const handle = this.options.actor.handle;",
          "      const ctx = this._federation.createContext(",
          "        new URL(this._publicationUrl),",
          "        { handle, publicationUrl: this._publicationUrl },",
          "      );",
          "      const documentLoader = await ctx.getDocumentLoader({ identifier: handle });",
          "      const cols = collections || this._collections;",
          "",
          "      const recipient = await resolveAuthor(postUrl, ctx, documentLoader, cols);",
          "      if (!recipient) {",
          "        return { ok: false, error: `Could not resolve post author for ${postUrl}` };",
          "      }",
          "",
          "      const uuid = crypto.randomUUID();",
          "      const activityId = `${this._publicationUrl.replace(/\\/$/, \"\")}/activitypub/likes/${uuid}`;",
          "",
          "      const like = new Like({",
          "        id: new URL(activityId),",
          "        actor: ctx.getActorUri(handle),",
          "        object: new URL(postUrl),",
          "      });",
          "",
          "      await ctx.sendActivity({ identifier: handle }, recipient, like, {",
          "        orderingKey: postUrl,",
          "      });",
          "",
          "      const interactions = cols?.get?.(\"ap_interactions\") || this._collections.ap_interactions;",
          "      if (interactions) {",
          "        await interactions.updateOne(",
          "          { objectUrl: postUrl, type: \"like\" },",
          "          { $set: { objectUrl: postUrl, type: \"like\", activityId, recipientUrl: recipient.id?.href || \"\", createdAt: new Date().toISOString() } },",
          "          { upsert: true },",
          "        );",
          "      }",
          "",
          "      console.info(`[ActivityPub] Sent Like for ${postUrl}`);",
          "      return { ok: true };",
          "    } catch (error) {",
          "      console.error(`[ActivityPub] likePost failed for ${postUrl}:`, error.message);",
          "      return { ok: false, error: error.message };",
          "    }",
          "  }",
          "",
          "  /**",
          "   * Send a native AP Announce (boost) activity for a post URL (called",
          "   * programmatically, e.g. when a repost is created via Micropub).",
          "   * @param {string} postUrl - URL of the post being boosted",
          "   * @param {object} [collections] - MongoDB collections map (application.collections)",
          "   * @returns {Promise<{ok: boolean, error?: string}>}",
          "   */",
          "  async boostPost(postUrl, collections) {",
          "    if (!this._federation) {",
          "      return { ok: false, error: \"Federation not initialized\" };",
          "    }",
          "",
          "    try {",
          "      const { Announce } = await import(\"@fedify/fedify/vocab\");",
          "      const handle = this.options.actor.handle;",
          "      const ctx = this._federation.createContext(",
          "        new URL(this._publicationUrl),",
          "        { handle, publicationUrl: this._publicationUrl },",
          "      );",
          "      const documentLoader = await ctx.getDocumentLoader({ identifier: handle });",
          "      const cols = collections || this._collections;",
          "",
          "      const uuid = crypto.randomUUID();",
          "      const activityId = `${this._publicationUrl.replace(/\\/$/, \"\")}/activitypub/boosts/${uuid}`;",
          "      const publicAddress = new URL(\"https://www.w3.org/ns/activitystreams#Public\");",
          "      const followersUri = ctx.getFollowersUri(handle);",
          "",
          "      const announce = new Announce({",
          "        id: new URL(activityId),",
          "        actor: ctx.getActorUri(handle),",
          "        object: new URL(postUrl),",
          "        to: publicAddress,",
          "        cc: followersUri,",
          "      });",
          "",
          "      // Broadcast to followers",
          "      await ctx.sendActivity({ identifier: handle }, \"followers\", announce, {",
          "        preferSharedInbox: true,",
          "        syncCollection: true,",
          "        orderingKey: postUrl,",
          "      });",
          "",
          "      // Also deliver directly to original post author",
          "      const recipient = await resolveAuthor(postUrl, ctx, documentLoader, cols);",
          "      if (recipient) {",
          "        await ctx.sendActivity({ identifier: handle }, recipient, announce, {",
          "          orderingKey: postUrl,",
          "        }).catch((err) => {",
          "          console.warn(`[ActivityPub] Direct boost delivery to author failed: ${err.message}`);",
          "        });",
          "      }",
          "",
          "      const interactions = cols?.get?.(\"ap_interactions\") || this._collections.ap_interactions;",
          "      if (interactions) {",
          "        await interactions.updateOne(",
          "          { objectUrl: postUrl, type: \"boost\" },",
          "          { $set: { objectUrl: postUrl, type: \"boost\", activityId, createdAt: new Date().toISOString() } },",
          "          { upsert: true },",
          "        );",
          "      }",
          "",
          "      console.info(`[ActivityPub] Sent Announce (boost) for ${postUrl}`);",
          "      return { ok: true };",
          "    } catch (error) {",
          "      console.error(`[ActivityPub] boostPost failed for ${postUrl}:`, error.message);",
          "      return { ok: false, error: error.message };",
          "    }",
          "  }",
          "",
          "  /**",
          "   * Send an Update(Person) activity to all followers so remote servers",
        ].join("\n"),
      },
    ],
  },
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let filesChecked = 0;
let filesPatched = 0;

for (const patchSpec of patchSpecs) {
  for (const filePath of patchSpec.candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    filesChecked += 1;

    const source = await readFile(filePath, "utf8");
    let updated = source;

    for (const replacement of patchSpec.replacements) {
      if (updated.includes(replacement.newSnippet)) {
        continue;
      }

      if (!updated.includes(replacement.oldSnippet)) {
        continue;
      }

      updated = updated.replace(replacement.oldSnippet, replacement.newSnippet);
    }

    if (updated === source) {
      continue;
    }

    await writeFile(filePath, updated, "utf8");
    filesPatched += 1;
  }
}

if (filesChecked === 0) {
  console.log("[postinstall] No activitypub like/boost patch targets found");
} else if (filesPatched === 0) {
  console.log("[postinstall] activitypub like/boost methods patch already applied");
} else {
  console.log(
    `[postinstall] Patched activitypub likePost/boostPost methods in ${filesPatched}/${filesChecked} file(s)`,
  );
}
