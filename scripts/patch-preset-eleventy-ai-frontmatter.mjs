import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-preset-eleventy/lib/post-template.js",
  "node_modules/@indiekit/preset-eleventy/lib/post-template.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-preset-eleventy/lib/post-template.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/preset-eleventy/lib/post-template.js",
];

const patchMarker = "Normalize AI disclosure metadata and default to no AI usage.";

const oldBlock = [
  "  // Convert url to Eleventy permalink so generated URL matches Indiekit's stored URL",
  "  // Add trailing slash to generate /path/index.html instead of /path.html",
  "  if (properties.url) {",
  "    const url = properties.url;",
  "    properties.permalink = url.endsWith(\"/\") ? url : `${url}/`;",
  "  }",
  "  delete properties.url;",
  "",
  "  const frontMatter = YAML.stringify(properties, { lineWidth: 0 });",
  "  return `---\\n${frontMatter}---\\n`;",
  "};",
].join("\n");

const newBlock = [
  "  // Convert url to Eleventy permalink so generated URL matches Indiekit's stored URL",
  "  // Add trailing slash to generate /path/index.html instead of /path.html",
  "  if (properties.url) {",
  "    const url = properties.url;",
  "    properties.permalink = url.endsWith(\"/\") ? url : `${url}/`;",
  "  }",
  "  delete properties.url;",
  "",
  "  // Normalize AI disclosure metadata and default to no AI usage.",
  "  const aiSource =",
  "    properties.ai && typeof properties.ai === \"object\" && !Array.isArray(properties.ai)",
  "      ? properties.ai",
  "      : {};",
  "",
  "  const aiTextLevel = String(",
  "    aiSource.textLevel ?? aiSource.aiTextLevel ?? properties.aiTextLevel ?? \"0\",",
  "  );",
  "",
  "  const aiCodeLevel = String(",
  "    aiSource.codeLevel ?? aiSource.aiCodeLevel ?? properties.aiCodeLevel ?? \"0\",",
  "  );",
  "",
  "  const aiTools = aiSource.aiTools ?? aiSource.tools ?? properties.aiTools;",
  "",
  "  const aiDescription =",
  "    aiSource.aiDescription ?? aiSource.description ?? properties.aiDescription;",
  "",
  "  delete properties.ai;",
  "  delete properties.aiTextLevel;",
  "  delete properties.aiCodeLevel;",
  "  delete properties.aiTools;",
  "  delete properties.aiDescription;",
  "",
  "  const frontMatter = YAML.stringify(properties, { lineWidth: 0 });",
  "",
  "  let aiFrontMatter = `ai:\\n  textLevel: \\\"${aiTextLevel}\\\"\\n  codeLevel: \\\"${aiCodeLevel}\\\"\\n  # aiTools: \\\"Claude, ChatGPT, Copilot\\\"\\n  # aiDescription: \\\"Optional disclosure about how AI was used\\\"\\n`;",
  "",
  "  if (aiTools !== undefined && aiTools !== null && aiTools !== \"\") {",
  "    aiFrontMatter = aiFrontMatter.replace(",
  "      '  # aiTools: \\\"Claude, ChatGPT, Copilot\\\"\\n',",
  "      `  aiTools: ${JSON.stringify(String(aiTools))}\\n`,",
  "    );",
  "  }",
  "",
  "  if (aiDescription !== undefined && aiDescription !== null && aiDescription !== \"\") {",
  "    aiFrontMatter = aiFrontMatter.replace(",
  "      '  # aiDescription: \\\"Optional disclosure about how AI was used\\\"\\n',",
  "      `  aiDescription: ${JSON.stringify(String(aiDescription))}\\n`,",
  "    );",
  "  }",
  "",
  "  return `---\\n${frontMatter}${aiFrontMatter}---\\n`;",
  "};",
].join("\n");

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

  if (!source.includes(oldBlock)) {
    console.warn(
      `[postinstall] Skipping preset-eleventy AI frontmatter patch for ${filePath}: upstream format changed`,
    );
    continue;
  }

  const updated = source.replace(oldBlock, newBlock);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No preset-eleventy post-template files found");
} else if (patched === 0) {
  console.log("[postinstall] preset-eleventy AI frontmatter patch already applied");
} else {
  console.log(
    `[postinstall] Patched preset-eleventy AI frontmatter in ${patched} file(s)`,
  );
}
