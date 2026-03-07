import { IndiekitError } from "@indiekit/error";

import { findBearerToken } from "../token.js";
import {
  getAllPostData,
  getPostData,
  syndicateToTargets,
} from "../utils.js";

/**
 * Delay helper for rate limiting between posts
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Syndicate a single post and update it via Micropub
 * @param {object} options - Options
 * @param {object} options.application - Application config
 * @param {object} options.publication - Publication config
 * @param {object} options.postData - Post data from database
 * @param {string} options.bearerToken - Bearer token for Micropub
 * @param {boolean} [options.force] - Force re-syndication (skip dedup)
 * @returns {Promise<object>} Result object
 */
const syndicatePost = async ({
  application,
  publication,
  postData,
  bearerToken,
  force = false,
}) => {
  const { failedTargets, syndicatedUrls } = await syndicateToTargets(
    publication,
    postData.properties,
    { force },
  );

  // Update post with syndicated URL(s) and remaining syndication target(s)
  const micropubResponse = await fetch(application.micropubEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "update",
      url: postData.properties.url,
      ...(!failedTargets && { delete: ["mp-syndicate-to"] }),
      replace: {
        ...(failedTargets && { "mp-syndicate-to": failedTargets }),
        ...(syndicatedUrls && { syndication: syndicatedUrls }),
      },
    }),
  });

  if (!micropubResponse.ok) {
    throw await IndiekitError.fromFetch(micropubResponse);
  }

  /** @type {object} */
  const body = await micropubResponse.json();

  return {
    url: postData.properties.url,
    body,
    failedTargets,
    syndicatedUrls,
  };
};

export const syndicateController = {
  async post(request, response, next) {
    try {
      const { application, publication } = request.app.locals;
      const bearerToken = findBearerToken(request);
      const sourceUrl =
        request.query.source_url || request.body?.syndication?.source_url;
      const redirectUri =
        request.query.redirect_uri || request.body?.syndication?.redirect_uri;

      const postsCollection = application?.collections?.get("posts");
      if (!postsCollection) {
        throw IndiekitError.notImplemented(
          response.locals.__("NotImplementedError.database"),
        );
      }

      // Get syndication targets
      const { syndicationTargets } = publication;
      if (syndicationTargets.length === 0) {
        return response.json({
          success: "OK",
          success_description: "No syndication targets have been configured",
        });
      }

      // --- Single post mode (when source_url is provided) ---
      if (sourceUrl) {
        const postData = await getPostData(postsCollection, sourceUrl);

        if (!postData) {
          return response.json({
            success: "OK",
            success_description: `No post record available for ${sourceUrl}`,
          });
        }

        const result = await syndicatePost({
          application,
          publication,
          postData,
          bearerToken,
          force: true,
        });

        // Include failed syndication targets in response
        if (result.failedTargets) {
          result.body.success_description +=
            ". The following target(s) did not return a URL: " +
            result.failedTargets.join(" ");
        }

        if (redirectUri && redirectUri.startsWith("/")) {
          const message = encodeURIComponent(result.body.success_description);
          return response.redirect(`${redirectUri}?success=${message}`);
        }

        return response.json(result.body);
      }

      // --- Batch mode (no source_url — process ALL pending posts) ---
      const allPostData = await getAllPostData(postsCollection);

      if (!allPostData || allPostData.length === 0) {
        return response.json({
          success: "OK",
          success_description: "No posts awaiting syndication",
        });
      }

      console.log(
        `[syndication] Batch processing ${allPostData.length} post(s)`,
      );

      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (const postData of allPostData) {
        try {
          const result = await syndicatePost({
            application,
            publication,
            postData,
            bearerToken,
          });

          results.push({
            url: result.url,
            success: true,
            syndicatedUrls: result.syndicatedUrls,
            ...(result.failedTargets && {
              failedTargets: result.failedTargets,
            }),
          });

          successCount++;
          console.log(
            `[syndication] Syndicated: ${result.url} (${result.syndicatedUrls.length} target(s))`,
          );
        } catch (error) {
          results.push({
            url: postData.properties?.url,
            success: false,
            error: error.message,
          });

          failCount++;
          console.error(
            `[syndication] Failed: ${postData.properties?.url} - ${error.message}`,
          );
        }

        // Rate limit delay between posts (2 seconds)
        if (allPostData.indexOf(postData) < allPostData.length - 1) {
          await delay(2000);
        }
      }

      const description =
        `Processed ${allPostData.length} post(s): ${successCount} succeeded, ${failCount} failed`;

      console.log(`[syndication] ${description}`);

      return response.json({
        success: "OK",
        success_description: description,
        results,
      });
    } catch (error) {
      next(error);
    }
  },
};
