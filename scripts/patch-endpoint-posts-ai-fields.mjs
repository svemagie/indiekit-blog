import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const endpointCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-posts",
  "node_modules/@indiekit/endpoint-posts",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-posts",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-posts",
];

const templates = {
  "aiTextLevel-field.njk": [
    '{% set aiTextLevelValue = fieldData("aiTextLevel").value or fieldData("ai-text-level").value or (properties.ai.textLevel if properties.ai and properties.ai.textLevel is defined else properties.aiTextLevel) or properties["ai-text-level"] or "0" %}',
    "{{ radios({",
    '  name: "aiTextLevel",',
    "  values: aiTextLevelValue,",
    "  fieldset: {",
    '    legend: "AI text level",',
    "    optional: true",
    "  },",
    "  items: [{",
    '    label: "0 - None",',
    '    value: "0"',
    "  }, {",
    '    label: "1 - Editorial assistance",',
    '    value: "1"',
    "  }, {",
    '    label: "2 - Co-drafting",',
    '    value: "2"',
    "  }, {",
    '    label: "3 - AI-generated (human reviewed)",',
    '    value: "3"',
    "  }]",
    "}) }}",
  ].join("\n"),
  "aiCodeLevel-field.njk": [
    '{% set aiCodeLevelValue = fieldData("aiCodeLevel").value or fieldData("ai-code-level").value or (properties.ai.codeLevel if properties.ai and properties.ai.codeLevel is defined else properties.aiCodeLevel) or properties["ai-code-level"] or "0" %}',
    "{{ radios({",
    '  name: "aiCodeLevel",',
    "  values: aiCodeLevelValue,",
    "  fieldset: {",
    '    legend: "AI code level",',
    "    optional: true",
    "  },",
    "  items: [{",
    '    label: "0 - Human-written",',
    '    value: "0"',
    "  }, {",
    '    label: "1 - AI-assisted",',
    '    value: "1"',
    "  }, {",
    '    label: "2 - Primarily AI-generated",',
    '    value: "2"',
    "  }]",
    "}) }}",
  ].join("\n"),
  "aiTools-field.njk": [
    '{% set aiToolsValue = fieldData("aiTools").value or fieldData("ai-tools").value or (properties.ai.aiTools if properties.ai and properties.ai.aiTools is defined else properties.aiTools) or properties["ai-tools"] %}',
    "{{ input({",
    '  name: "aiTools",',
    "  value: aiToolsValue,",
    '  label: "AI Tools",',
    '  hint: "Optional, comma-separated (e.g. Claude, ChatGPT, Copilot)",',
    "  optional: true",
    "}) }}",
  ].join("\n"),
  "aiDescription-field.njk": [
    '{% set aiDescriptionValue = fieldData("aiDescription").value or fieldData("ai-description").value or (properties.ai.aiDescription if properties.ai and properties.ai.aiDescription is defined else properties.aiDescription) or properties["ai-description"] %}',
    "{{ textarea({",
    '  name: "aiDescription",',
    "  value: aiDescriptionValue,",
    '  label: "AI usage note",',
    '  hint: "Optional: short note describing how AI was used",',
    "  optional: true",
    "}) }}",
  ].join("\n"),
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let checkedEndpoints = 0;
let checkedFiles = 0;
let patchedFiles = 0;

for (const endpointPath of endpointCandidates) {
  if (!(await exists(endpointPath))) {
    continue;
  }

  const includeDir = path.join(endpointPath, "includes", "post-types");
  if (!(await exists(includeDir))) {
    continue;
  }

  checkedEndpoints += 1;
  await mkdir(includeDir, { recursive: true });

  for (const [fileName, template] of Object.entries(templates)) {
    checkedFiles += 1;

    const filePath = path.join(includeDir, fileName);
    const desired = `${template}\n`;

    let current = "";
    if (await exists(filePath)) {
      current = await readFile(filePath, "utf8");
    }

    if (current === desired) {
      continue;
    }

    await writeFile(filePath, desired, "utf8");
    patchedFiles += 1;
  }
}

if (checkedEndpoints === 0) {
  console.log("[postinstall] No endpoint-posts package directories found");
} else if (checkedFiles === 0) {
  console.log("[postinstall] No endpoint-posts AI field templates checked");
} else if (patchedFiles === 0) {
  console.log("[postinstall] endpoint-posts AI field templates already patched");
} else {
  console.log(
    `[postinstall] Patched endpoint-posts AI field templates in ${patchedFiles}/${checkedFiles} file(s)`,
  );
}
