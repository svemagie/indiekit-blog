import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/endpoint-files/views/file-form.njk",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-files/views/file-form.njk",
];

const oldCode = "xhr.open('POST', endpoint);";
const newCode = "xhr.open('POST', window.location.pathname);";

const textFallbackPatches = [
  {
    from: '{{ __("files.upload.dropText") }}',
    to: '{{ __("files.upload.dropText") == "files.upload.dropText" and "Drag files here or" or __("files.upload.dropText") }}',
  },
  {
    from: '{{ __("files.upload.browse") }}',
    to: '{{ __("files.upload.browse") == "files.upload.browse" and "Browse files" or __("files.upload.browse") }}',
  },
  {
    from: '{{ __("files.upload.submitMultiple") }}',
    to: '{{ __("files.upload.submitMultiple") == "files.upload.submitMultiple" and "Upload files" or __("files.upload.submitMultiple") }}',
  },
];

const fallbackSubmitBlock = `  {# Reliable fallback submit (works even when Alpine/XHR upload is unavailable) #}
  <div class="button-group">
    {{ button({
      text: __("files.form.submit"),
      attributes: {
        type: "submit",
        formenctype: "multipart/form-data",
        "x-show": "files.length === 0 || allDone"
      }
    }) }}
  </div>
`;

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
  let changed = false;

  if (updated.includes(oldCode)) {
    updated = updated.replace(oldCode, newCode);
    changed = true;
  }

  for (const patch of textFallbackPatches) {
    if (updated.includes(patch.from) && !updated.includes(patch.to)) {
      updated = updated.replace(patch.from, patch.to);
      changed = true;
    }
  }

  if (updated.includes("<noscript>")) {
    const noScriptPattern = /\n\s*\{# No-JS fallback #\}[\s\S]*?<\/noscript>\n/;
    if (noScriptPattern.test(updated)) {
      updated = updated.replace(noScriptPattern, `\n${fallbackSubmitBlock}\n`);
      changed = true;
    }
  }

  if (!changed) {
    continue;
  }

  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No endpoint-files upload template files found");
} else if (patched === 0) {
  console.log("[postinstall] endpoint-files upload template already patched");
} else {
  console.log(
    `[postinstall] Patched endpoint-files upload template in ${patched} file(s)`,
  );
}
