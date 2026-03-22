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

// Matches the original form (diag block immediately before the return)
const OLD_SNIPPET_V1 = `      // Diagnostic: log inbox POSTs to detect federation stalls
      if (req.method === "POST" && req.path.includes("inbox")) {
        const ua = req.get("user-agent") || "unknown";
        const bodyParsed = req.body !== undefined && Object.keys(req.body || {}).length > 0;
        console.info(\`[federation-diag] POST \${req.path} from=\${ua.slice(0, 60)} bodyParsed=\${bodyParsed} readable=\${req.readable}\`);
      }

      return self._fedifyMiddleware(req, res, next);`;

const NEW_SNIPPET_V1 = `      // ap-remove-federation-diag patch
      return self._fedifyMiddleware(req, res, next);`;

// Matches the updated form (diag block followed by Accept-upgrade block before the return)
const OLD_SNIPPET_V2 = `      // Diagnostic: log inbox POSTs to detect federation stalls
      if (req.method === "POST" && req.path.includes("inbox")) {
        const ua = req.get("user-agent") || "unknown";
        const bodyParsed = req.body !== undefined && Object.keys(req.body || {}).length > 0;
        console.info(\`[federation-diag] POST \${req.path} from=\${ua.slice(0, 60)} bodyParsed=\${bodyParsed} readable=\${req.readable}\`);
      }

      // Fedify's`;

const NEW_SNIPPET_V2 = `      // ap-remove-federation-diag patch

      // Fedify's`;

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

  let matched = false;
  if (source.includes(OLD_SNIPPET_V1)) {
    source = source.replace(OLD_SNIPPET_V1, NEW_SNIPPET_V1);
    matched = true;
  } else if (source.includes(OLD_SNIPPET_V2)) {
    source = source.replace(OLD_SNIPPET_V2, NEW_SNIPPET_V2);
    matched = true;
  }

  if (!matched) {
    console.log(`[postinstall] patch-ap-remove-federation-diag: snippet not found in ${filePath}`);
    continue;
  }
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
