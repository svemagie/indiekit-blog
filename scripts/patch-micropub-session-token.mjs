/**
 * Patch: fix session.token → session.access_token in micropub action controller.
 *
 * The indieauth authenticate middleware stores the bearer token as
 * `session.access_token`, but the micropub action controller destructures it
 * as `session.token`. This causes `uploadMedia` to be called with
 * `token = undefined`, resulting in `Authorization: Bearer undefined` on the
 * internal /media fetch — a 500 for any Micropub client that uploads files
 * directly (e.g. OwnYourSwarm).
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/endpoint-micropub/lib/controllers/action.js",
];

const oldCode = "const { scope, token } = session;";
const newCode = "const { scope, access_token: token } = session;";

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
  if (!(await exists(filePath))) continue;

  checked += 1;
  const source = await readFile(filePath, "utf8");

  if (source.includes(newCode)) {
    continue;
  }

  if (!source.includes(oldCode)) {
    console.warn(`[postinstall] micropub-session-token: snippet not found in ${filePath} — skipping`);
    continue;
  }

  const updated = source.replace(oldCode, newCode);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No micropub action controller found");
} else if (patched === 0) {
  console.log("[postinstall] micropub session token patch already applied");
} else {
  console.log(`[postinstall] Patched micropub session token in ${patched} file(s)`);
}
