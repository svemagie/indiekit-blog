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

const newCallbackRedirectCode = `        const { redirect } = request.query;
        const requestedRedirect =
          typeof redirect === "string" ? redirect : "";
        const normalizedRedirect =
          requestedRedirect === "/admin"
            ? "/"
            : requestedRedirect.replace(/^\\/admin(?=\\/)/, "");
        this.redirectUri = normalizedRedirect
          ? \`\${callbackUrl}?redirect=\${normalizedRedirect}\`
          : \`\${callbackUrl}\`;`;

const oldCallbackRedirectRegex =
  /const \{ redirect \} = request\.query;\n\s+this\.redirectUri = redirect\n\s+\? `\$\{callbackUrl\}\?redirect=\$\{redirect\}`\n\s+: `\$\{callbackUrl\}`;/m;

const newLoginRedirectCode = `        if (request.method === "GET") {
          const directAlias = request.originalUrl.replace(
            /^\\/admin\\/(auth|session)(?=\\/|$)/,
            "/$1",
          );
          if (directAlias !== request.originalUrl) {
            return response.redirect(directAlias);
          }

          const loginRedirect =
            request.originalUrl === "/admin"
              ? "/"
              : request.originalUrl.replace(/^\\/admin(?=\\/)/, "");
          return response.redirect(
            \`/session/login?redirect=\${loginRedirect}\`,
          );
        }`;

const oldLoginRedirectRegexes = [
  /if \(request\.method === "GET"\) \{\n\s+return response\.redirect\(\n\s+`\/session\/login\?redirect=\$\{request\.originalUrl\}`,\n\s+\);\n\s+\}/m,
  /if \(request\.method === "GET"\) \{\n\s+const loginRedirect =[\s\S]*?`\/session\/login\?redirect=\$\{loginRedirect\}`,\n\s+\);\n\s+\}/m,
];

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
    !updated.includes("const normalizedRedirect =") &&
    oldCallbackRedirectRegex.test(updated)
  ) {
    updated = updated.replace(oldCallbackRedirectRegex, newCallbackRedirectCode);
  }

  if (!updated.includes("const directAlias = request.originalUrl.replace(")) {
    for (const regex of oldLoginRedirectRegexes) {
      if (regex.test(updated)) {
        updated = updated.replace(regex, newLoginRedirectCode);
        break;
      }
    }
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
  console.log(`[postinstall] Patched indieauth auth guards in ${patched} file(s)`);
}
