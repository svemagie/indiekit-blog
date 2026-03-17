/**
 * Patch: dual-mount blogroll public API at /blogrollapi AND /rssapi,
 * and add a /api/feeds alias for /api/blogs.
 *
 * Problem: two static pages call different base paths:
 *   /blogroll → fetches /blogrollapi/api/blogs, /api/categories, /api/items, /api/status
 *   /news     → fetches /rssapi/api/items, /rssapi/api/feeds, /rssapi/api/status
 *
 * Solution:
 *   1. Keep mountPath "/blogrollapi" (serves the /blogroll page as-is).
 *   2. In init(), register a thin second endpoint at "/rssapi" pointing to the
 *      same publicRouter so the /news page's fetches also resolve.
 *   3. Add /api/feeds as an alias of /api/blogs on both routers.
 */
import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "blogroll-feeds-alias",
    marker: "feeds alias for /api/blogs",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-blogroll/index.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-blogroll/index.js",
    ],
    oldSnippet: `    publicRouter.get("/api/blogs", apiController.listBlogs);`,
    newSnippet: `    publicRouter.get("/api/blogs", apiController.listBlogs);
    // feeds alias for /api/blogs (used by the /news/ static page)
    publicRouter.get("/api/feeds", apiController.listBlogs);`,
  },
  {
    name: "blogroll-rssapi-dual-mount",
    marker: "rssapi dual-mount alias",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-blogroll/index.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-blogroll/index.js",
    ],
    oldSnippet: `  init(Indiekit) {
    Indiekit.addEndpoint(this);`,
    newSnippet: `  init(Indiekit) {
    Indiekit.addEndpoint(this);

    // rssapi dual-mount alias: register the same public routes at /rssapi
    // with a response-shape transformer so the /news static page works.
    // The /news page expects: item.link (not .url), item.feedId (not .blog.id),
    // item.feedTitle/sourceTitle (not .blog.title), item.sourceUrl (not .blog.siteUrl),
    // item.author (fallback to .blog.title), and feedsRes.feeds (not .items).
    const rssapiRouter = express.Router();
    rssapiRouter.use((req, res, next) => {
      const originalJson = res.json.bind(res);
      res.json = function (data) {
        if (data && Array.isArray(data.items)) {
          if (req.path.startsWith("/api/items")) {
            // Map url->link, blog->flat feed fields
            data = {
              ...data,
              items: data.items.map((item) => ({
                ...item,
                link: item.url,
                feedId: item.blog?.id ?? null,
                feedTitle: item.blog?.title ?? null,
                sourceUrl: item.blog?.siteUrl ?? null,
                sourceTitle: item.blog?.title ?? null,
                author: item.author || item.blog?.title || null,
              })),
            };
          } else if (req.path === "/api/feeds") {
            // Rename items->feeds so feedsRes.feeds resolves correctly
            const { items, ...rest } = data;
            data = { ...rest, feeds: items };
          }
        }
        return originalJson(data);
      };
      next();
    });
    rssapiRouter.use(publicRouter);
    Indiekit.addEndpoint({
      name: "Blogroll /rssapi alias",
      mountPath: "/rssapi",
      get routesPublic() {
        return rssapiRouter;
      },
    });`,
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

for (const spec of patchSpecs) {
  let foundAnyTarget = false;

  for (const filePath of spec.candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    filesChecked += 1;

    const source = await readFile(filePath, "utf8");

    if (source.includes(spec.marker)) {
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
      continue;
    }

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);
    await writeFile(filePath, updated, "utf8");
    filesPatched += 1;
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (filesChecked === 0) {
  console.log("[postinstall] No blogroll endpoint files found");
} else if (filesPatched === 0) {
  console.log("[postinstall] blogroll feeds alias + rssapi dual-mount already patched");
} else {
  console.log(
    `[postinstall] Patched blogroll feeds alias + rssapi dual-mount in ${filesPatched}/${filesChecked} file(s)`,
  );
}
