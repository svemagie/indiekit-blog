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
    '{% set aiTextLevelValue = fieldData("aiTextLevel").value or (properties.ai.textLevel if properties.ai and properties.ai.textLevel is defined else properties.aiTextLevel) or "0" %}',
    "{{ radios({",
    '  name: "aiTextLevel",',
    "  values: aiTextLevelValue,",
    "  fieldset: {",
    '    legend: "AI Text-Einsatz",',
    "    optional: true",
    "  },",
    "  items: [{",
    '    label: "0 - Kein KI-Text",',
    '    value: "0"',
    "  }, {",
    '    label: "1 - Leichte KI-Hilfe",',
    '    value: "1"',
    "  }, {",
    '    label: "2 - Teilweise KI-generiert",',
    '    value: "2"',
    "  }, {",
    '    label: "3 - Ueberwiegend KI-generiert",',
    '    value: "3"',
    "  }]",
    "}) }}",
  ].join("\n"),
  "aiCodeLevel-field.njk": [
    '{% set aiCodeLevelValue = fieldData("aiCodeLevel").value or (properties.ai.codeLevel if properties.ai and properties.ai.codeLevel is defined else properties.aiCodeLevel) or "0" %}',
    "{{ radios({",
    '  name: "aiCodeLevel",',
    "  values: aiCodeLevelValue,",
    "  fieldset: {",
    '    legend: "AI Code-Einsatz",',
    "    optional: true",
    "  },",
    "  items: [{",
    '    label: "0 - Kein KI-Code",',
    '    value: "0"',
    "  }, {",
    '    label: "1 - Leichte KI-Hilfe",',
    '    value: "1"',
    "  }, {",
    '    label: "2 - Teilweise KI-generiert",',
    '    value: "2"',
    "  }, {",
    '    label: "3 - Ueberwiegend KI-generiert",',
    '    value: "3"',
    "  }]",
    "}) }}",
  ].join("\n"),
  "aiTools-field.njk": [
    '{% set aiToolsValue = fieldData("aiTools").value or (properties.ai.aiTools if properties.ai and properties.ai.aiTools is defined else properties.aiTools) %}',
    "{{ input({",
    '  name: "aiTools",',
    "  value: aiToolsValue,",
    '  label: "AI Tools",',
    '  hint: "Optional, komma-separiert (z. B. Claude, ChatGPT, Copilot)",',
    "  optional: true",
    "}) }}",
  ].join("\n"),
  "aiDescription-field.njk": [
    '{% set aiDescriptionValue = fieldData("aiDescription").value or (properties.ai.aiDescription if properties.ai and properties.ai.aiDescription is defined else properties.aiDescription) %}',
    "{{ textarea({",
    '  name: "aiDescription",',
    "  value: aiDescriptionValue,",
    '  label: "AI Beschreibung",',
    '  hint: "Optional: kurze Erlaeuterung, wie KI verwendet wurde",',
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
