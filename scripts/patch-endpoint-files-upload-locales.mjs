import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const localeDirCandidates = [
  "node_modules/@indiekit/endpoint-files/locales",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-files/locales",
];

const defaultLabels = {
  dropText: "Drag files here or",
  browse: "Browse files",
  submitMultiple: "Upload files",
};

const localeLabels = {
  de: {
    dropText: "Dateien hierher ziehen oder",
    browse: "Dateien auswaehlen",
    submitMultiple: "Dateien hochladen",
  },
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let checkedDirs = 0;
let checkedFiles = 0;
let patchedFiles = 0;

for (const localeDir of localeDirCandidates) {
  if (!(await exists(localeDir))) {
    continue;
  }

  checkedDirs += 1;
  const files = (await readdir(localeDir)).filter((file) => file.endsWith(".json"));

  for (const fileName of files) {
    const filePath = path.join(localeDir, fileName);
    const source = await readFile(filePath, "utf8");
    let json;

    try {
      json = JSON.parse(source);
    } catch {
      continue;
    }

    checkedFiles += 1;

    if (!json.files || typeof json.files !== "object") {
      json.files = {};
    }

    if (!json.files.upload || typeof json.files.upload !== "object") {
      json.files.upload = {};
    }

    const locale = fileName.replace(/\.json$/, "");
    const labels = localeLabels[locale] || defaultLabels;

    let changed = false;
    for (const [key, value] of Object.entries(labels)) {
      if (!json.files.upload[key]) {
        json.files.upload[key] = value;
        changed = true;
      }
    }

    if (!changed) {
      continue;
    }

    await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    patchedFiles += 1;
  }
}

if (checkedDirs === 0) {
  console.log("[postinstall] No endpoint-files locale directories found");
} else if (patchedFiles === 0) {
  console.log("[postinstall] endpoint-files upload locale keys already patched");
} else {
  console.log(
    `[postinstall] Patched endpoint-files upload locale keys in ${patchedFiles}/${checkedFiles} locale file(s)`,
  );
}
