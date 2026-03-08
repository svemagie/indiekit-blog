import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/indiekit/lib/indieauth.js",
];

const oldDevModeCode = `if (devMode) {
        request.session.access_token = process.env.NODE_ENV;
        request.session.scope = "create update delete media";
      } else if (!process.env.PASSWORD_SECRET) {`;

const newDevModeCode = `if (devMode && process.env.INDIEKIT_ALLOW_DEV_AUTH === "1") {
        request.session.access_token = process.env.NODE_ENV;
        request.session.scope = "create update delete media";
      } else if (!process.env.PASSWORD_SECRET) {`;

const oldRedirectRegex =
  "const validRedirect = redirect.match(/^\\/[\\w&/=?]*$/);";
const newRedirectRegex =
  "const validRedirect = redirect.match(/^\\/[\\w&/=?%.-]*$/);";

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
  let updated = source;

  if (!updated.includes(newDevModeCode) && updated.includes(oldDevModeCode)) {
    updated = updated.replace(oldDevModeCode, newDevModeCode);
  }

  if (
    !updated.includes(newRedirectRegex) &&
    updated.includes(oldRedirectRegex)
  ) {
    updated = updated.replace(oldRedirectRegex, newRedirectRegex);
  }

  if (updated !== source) {
    await writeFile(filePath, updated, "utf8");
    patched += 1;
  }
}

if (checked === 0) {
  console.log("[postinstall] No indieauth middleware files found");
} else if (patched === 0) {
  console.log("[postinstall] indieauth auth-guard patches already applied");
} else {
  console.log(`[postinstall] Patched indieauth auth guards/redirect validation in ${patched} file(s)`);
}
