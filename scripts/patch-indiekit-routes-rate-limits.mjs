import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/indiekit/lib/routes.js",
];

const patchMarker = "const sessionLimit = rateLimit({";

const oldLimitBlock = `const router = express.Router();
const limit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 250,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});`;

const newLimitBlock = `const router = express.Router();

// Strict rate limiter for session/auth routes (brute force protection)
const sessionLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// Generous rate limiter for public API endpoints (read-only data)
const apiLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});`;

const replacements = [
  {
    label: "session login rate limit",
    from: '  router.get("/session/login", limit, sessionController.login);',
    to: '  router.get("/session/login", sessionLimit, sessionController.login);',
  },
  {
    label: "session post rate limit",
    from: '  router.post("/session/login", limit, indieauth.login());',
    to: '  router.post("/session/login", sessionLimit, indieauth.login());',
  },
  {
    label: "session auth rate limit",
    from: '  router.get("/session/auth", limit, indieauth.authorize());',
    to: '  router.get("/session/auth", sessionLimit, indieauth.authorize());',
  },
  {
    label: "public _routes rate limit",
    from: "      router.use(endpoint.mountPath, limit, endpoint._routes(Indiekit));",
    to: "      router.use(endpoint.mountPath, apiLimit, endpoint._routes(Indiekit));",
  },
  {
    label: "public routesPublic rate limit",
    from: `    if (endpoint.mountPath && endpoint.routesPublic) {
      router.use(endpoint.mountPath, limit, endpoint.routesPublic);
    }`,
    to: `    if (endpoint.mountPath && endpoint.routesPublic) {
      // Skip rate limiting for root-mounted endpoints (mountPath "/") because
      // router.use("/", apiLimit, ...) matches ALL routes, applying the rate
      // limiter globally.
      if (endpoint.mountPath === "/") {
        router.use(endpoint.mountPath, endpoint.routesPublic);
      } else {
        router.use(endpoint.mountPath, apiLimit, endpoint.routesPublic);
      }
    }`,
  },
  {
    label: "well-known rate limit",
    from: '      router.use("/.well-known/", limit, endpoint.routesWellKnown);',
    to: '      router.use("/.well-known/", apiLimit, endpoint.routesWellKnown);',
  },
  {
    label: "content negotiation routes",
    from: "  // Authenticate subsequent requests",
    to: `  // Content negotiation routes - serves ActivityPub JSON-LD for post URLs
  // and handles NodeInfo data at /nodeinfo/2.1. Mounted at root before auth
  // so unauthenticated AP clients can fetch post representations.
  for (const endpoint of endpoints) {
    if (endpoint.contentNegotiationRoutes) {
      router.use("/", endpoint.contentNegotiationRoutes);
    }
  }

  // Authenticate subsequent requests`,
  },
  {
    label: "plugin list limit removal",
    from: '  router.get("/plugins", limit, pluginController.list);',
    to: '  router.get("/plugins", pluginController.list);',
  },
  {
    label: "plugin view limit removal",
    from: '  router.get("/plugins/:pluginId", limit, pluginController.view);',
    to: '  router.get("/plugins/:pluginId", pluginController.view);',
  },
  {
    label: "status limit removal",
    from: '  router.get("/status", limit, statusController.viewStatus);',
    to: '  router.get("/status", statusController.viewStatus);',
  },
  {
    label: "authenticated endpoint limit removal",
    from: "      router.use(endpoint.mountPath, limit, endpoint.routes);",
    to: "      router.use(endpoint.mountPath, endpoint.routes);",
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

let checked = 0;
let patched = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  checked += 1;
  const source = await readFile(filePath, "utf8");

  if (source.includes(patchMarker)) {
    continue;
  }

  if (!source.includes(oldLimitBlock)) {
    console.warn(
      `[postinstall] Skipping routes patch for ${filePath}: upstream format changed`,
    );
    continue;
  }

  let updated = source.replace(oldLimitBlock, newLimitBlock);

  for (const replacement of replacements) {
    if (updated.includes(replacement.from)) {
      updated = updated.replace(replacement.from, replacement.to);
    } else {
      console.warn(
        `[postinstall] routes patch skipped section (${replacement.label}) in ${filePath}`,
      );
    }
  }

  const looksPatched =
    updated.includes("const sessionLimit = rateLimit({") &&
    updated.includes("const apiLimit = rateLimit({") &&
    updated.includes('router.get("/session/login", sessionLimit, sessionController.login);') &&
    updated.includes("router.use(endpoint.mountPath, endpoint.routes);") &&
    !updated.includes('router.get("/session/login", limit, sessionController.login);') &&
    !updated.includes("router.use(endpoint.mountPath, limit, endpoint.routes);");

  if (!looksPatched) {
    console.warn(
      `[postinstall] Skipping routes patch for ${filePath}: patch validation failed`,
    );
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No indiekit routes files found");
} else if (patched === 0) {
  console.log("[postinstall] indiekit routes rate-limit patch already applied");
} else {
  console.log(`[postinstall] Patched indiekit routes rate limits in ${patched} file(s)`);
}