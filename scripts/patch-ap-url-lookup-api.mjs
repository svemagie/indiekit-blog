/**
 * Patch: add a public GET /api/ap-url endpoint to the ActivityPub endpoint.
 *
 * Problem:
 *   The "Also on fediverse" widget on blog post pages passes the blog post URL
 *   (e.g. https://blog.giersig.eu/replies/bd78a/) to the Mastodon
 *   authorize_interaction flow:
 *     https://{instance}/authorize_interaction?uri={blog-post-url}
 *
 *   When the remote instance fetches that URI with Accept: application/activity+json,
 *   it may hit a static file server (nginx/Caddy) that returns HTML instead of
 *   AP JSON, causing the interaction to fail with "Could not connect to the given
 *   address" or a similar error.
 *
 * Fix:
 *   Add a public API route to the AP endpoint:
 *     GET /activitypub/api/ap-url?post={blog-post-url}
 *
 *   This resolves the post in MongoDB, determines its object type (Note or Article),
 *   and returns the canonical Fedify-served AP object URL:
 *     { apUrl: "https://blog.giersig.eu/activitypub/objects/note/replies/bd78a/" }
 *
 *   The "Also on fediverse" JS widget can then call this API and use the returned
 *   apUrl in the authorize_interaction redirect instead of the blog post URL.
 *   Fedify-served URLs (/activitypub/objects/…) are always proxied to Node.js and
 *   will reliably return AP JSON with correct content negotiation.
 *
 * The patch inserts the new route in the `routesPublic` getter of index.js,
 * just before the closing `return router` statement.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
];

const MARKER = "// AP URL lookup endpoint";

const OLD_SNIPPET = `    router.all("/inbox", (req, res) => {
      res
        .status(405)
        .set("Allow", "POST")
        .type("application/activity+json")
        .json({
          error: "Method Not Allowed",
          message: "The shared inbox only accepts POST requests",
        });
    });

    return router;
  }

  /**
   * Authenticated admin routes — mounted at mountPath, behind IndieAuth.
   */`;

const NEW_SNIPPET = `    router.all("/inbox", (req, res) => {
      res
        .status(405)
        .set("Allow", "POST")
        .type("application/activity+json")
        .json({
          error: "Method Not Allowed",
          message: "The shared inbox only accepts POST requests",
        });
    });

    // AP URL lookup endpoint
    // Public API: resolve a blog post URL → its Fedify-served AP object URL.
    // GET /api/ap-url?post=https://blog.example.com/notes/foo/
    // Returns { apUrl: "https://blog.example.com/activitypub/objects/note/notes/foo/" }
    //
    // Use this in "Also on fediverse" widgets so that authorize_interaction
    // uses a URL that is always routed to Node.js (never intercepted by a
    // static file server), ensuring reliable AP content negotiation.
    router.get("/api/ap-url", async (req, res) => {
      try {
        const postParam = req.query.post;
        if (!postParam) {
          return res.status(400).json({ error: "post parameter required" });
        }

        const { application } = req.app.locals;
        const postsCollection = application.collections?.get("posts");

        if (!postsCollection) {
          return res.status(503).json({ error: "Database unavailable" });
        }

        const publicationUrl = (self._publicationUrl || application.url || "").replace(/\\/$/, "");

        // Match with or without trailing slash
        const postUrl = postParam.replace(/\\/$/, "");
        const post = await postsCollection.findOne({
          "properties.url": { $in: [postUrl, postUrl + "/"] },
        });

        if (!post) {
          return res.status(404).json({ error: "Post not found" });
        }

        // Draft and unlisted posts are not federated
        if (post?.properties?.["post-status"] === "draft") {
          return res.status(404).json({ error: "Post not found" });
        }
        if (post?.properties?.visibility === "unlisted") {
          return res.status(404).json({ error: "Post not found" });
        }

        // Determine the AP object type (mirrors jf2-to-as2.js logic)
        const postType = post.properties?.["post-type"];
        const isArticle = postType === "article" && !!post.properties?.name;
        const objectType = isArticle ? "article" : "note";

        // Extract the path portion after the publication base URL
        const resolvedUrl = (post.properties?.url || "").replace(/\\/$/, "");
        if (!resolvedUrl.startsWith(publicationUrl)) {
          return res.status(500).json({ error: "Post URL does not match publication base" });
        }
        const postPath = resolvedUrl.slice(publicationUrl.length).replace(/^\\//, "");

        const mp = (self.options.mountPath || "").replace(/\\/$/, "");
        const apBase = publicationUrl;
        const apUrl = \`\${apBase}\${mp}/objects/\${objectType}/\${postPath}\`;

        res.set("Cache-Control", "public, max-age=300");
        res.json({ apUrl });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  /**
   * Authenticated admin routes — mounted at mountPath, behind IndieAuth.
   */`;

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let checked = 0;
let patched = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  checked += 1;
  const source = await readFile(filePath, "utf8");

  if (source.includes(MARKER)) {
    continue;
  }

  if (!source.includes(OLD_SNIPPET)) {
    console.log(`[postinstall] patch-ap-url-lookup-api: old snippet not found in ${filePath}`);
    continue;
  }

  const updated = source.replace(OLD_SNIPPET, NEW_SNIPPET);

  if (updated === source) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-url-lookup-api to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-url-lookup-api: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-url-lookup-api: already up to date");
} else {
  console.log(`[postinstall] patch-ap-url-lookup-api: patched ${patched}/${checked} file(s)`);
}
