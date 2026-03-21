/**
 * Patch: remove federation-diag inbox logging from the ActivityPub endpoint.
 *
 * The diagnostic block logs every inbox POST to detect federation stalls.
 * It is no longer needed and produces noise in indiekit.log.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/index.js",
];

const MARKER = "// ap-remove-federation-diag patch";

const OLD_SNIPPET = `      // Diagnostic: log inbox POSTs to detect federation stalls
      if (req.method === "POST" && req.path.includes("inbox")) {
        const ua = req.get("user-agent") || "unknown";
        const bodyParsed = req.body !== undefined && Object.keys(req.body || {}).length > 0;
        console.info(\`[federation-diag] POST \${req.path} from=\${ua.slice(0, 60)} bodyParsed=\${bodyParsed} readable=\${req.readable}\`);
      }

      return self._fedifyMiddleware(req, res, next);`;

const NEW_SNIPPET = `      // ap-remove-federation-diag patch
      return self._fedifyMiddleware(req, res, next);`;

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
  let source = await readFile(filePath, "utf8");

  if (source.includes(MARKER)) {
    continue; // already patched
  }

  if (!source.includes(OLD_SNIPPET)) {
    console.log(`[postinstall] patch-ap-remove-federation-diag: snippet not found in ${filePath}`);
    continue;
  }

  source = source.replace(OLD_SNIPPET, NEW_SNIPPET);
  await writeFile(filePath, source, "utf8");
  patched += 1;
  console.log(`[postinstall] Applied patch-ap-remove-federation-diag to ${filePath}`);
}

if (checked === 0) {
  console.log("[postinstall] patch-ap-remove-federation-diag: no target files found");
} else if (patched === 0) {
  console.log("[postinstall] patch-ap-remove-federation-diag: already up to date");
} else {
  console.log(`[postinstall] patch-ap-remove-federation-diag: patched ${patched}/${checked} file(s)`);
}
