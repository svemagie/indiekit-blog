import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/indiekit/lib/middleware/error.js",
];

const marker = 'const isDev = process.env.NODE_ENV !== "production";';

const replacements = [
  {
    from: "  debug(\"Error\", error);\n",
    to: `  debug("Error", error);\n\n  // Only include stack traces in development\n  const isDev = process.env.NODE_ENV !== "production";\n`,
  },
  {
    from: "      stack: error.stack,",
    to: "      stack: isDev ? error.stack : undefined,",
  },
  {
    from: "      stack: cleanStack(error.stack),",
    to: "      ...(isDev && { stack: cleanStack(error.stack) }),",
  },
  {
    from: "      ...(error.cause && { cause: error.cause }),",
    to: "      ...(isDev && error.cause && { cause: error.cause }),",
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

  if (source.includes(marker)) {
    continue;
  }

  let updated = source;

  for (const replacement of replacements) {
    if (updated.includes(replacement.from)) {
      updated = updated.replace(replacement.from, replacement.to);
    }
  }

  const looksPatched =
    updated.includes(marker) &&
    updated.includes("stack: isDev ? error.stack : undefined,") &&
    updated.includes("...(isDev && { stack: cleanStack(error.stack) }),") &&
    updated.includes("...(isDev && error.cause && { cause: error.cause }),") &&
    !updated.includes("stack: error.stack,");

  if (!looksPatched) {
    console.warn(
      `[postinstall] Skipping error middleware patch for ${filePath}: upstream format changed`,
    );
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No indiekit error middleware files found");
} else if (patched === 0) {
  console.log("[postinstall] indiekit error stack patch already applied");
} else {
  console.log(`[postinstall] Patched indiekit production error stack handling in ${patched} file(s)`);
}