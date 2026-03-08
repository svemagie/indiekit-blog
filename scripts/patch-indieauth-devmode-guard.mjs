import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/indiekit/lib/indieauth.js",
];

const oldCode = `if (devMode) {
        request.session.access_token = process.env.NODE_ENV;
        request.session.scope = "create update delete media";
      } else if (!process.env.PASSWORD_SECRET) {`;

const newCode = `if (devMode && process.env.INDIEKIT_ALLOW_DEV_AUTH === "1") {
        request.session.access_token = process.env.NODE_ENV;
        request.session.scope = "create update delete media";
      } else if (!process.env.PASSWORD_SECRET) {`;

async function exists(path) {
  try {
    await access(path);
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

  if (source.includes(newCode)) {
    continue;
  }

  if (!source.includes(oldCode)) {
    continue;
  }

  const updated = source.replace(oldCode, newCode);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No indieauth middleware files found");
} else if (patched === 0) {
  console.log("[postinstall] indieauth dev-mode guard already patched");
} else {
  console.log(`[postinstall] Patched indieauth dev-mode guard in ${patched} file(s)`);
}
