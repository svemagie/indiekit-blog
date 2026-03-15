import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const endpointCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-posts",
  "node_modules/@indiekit/endpoint-posts",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-posts",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-posts",
];

const sourceLocale = "en";
const targetLocales = ["de"];

const localeOverrides = {
  de: {
    posts: {
      delete: {
        cancel: "Nein – zurück zum Beitrag",
      },
      purge: {
        action: "Endgültig löschen",
        title: "Diesen Beitrag endgültig löschen?",
        warning:
          "Der Beitrag wird aus der Datenbank entfernt. Diese Aktion kann nicht rückgängig gemacht werden.",
        submit: "Ich bin sicher – endgültig löschen",
        cancel: "Nein – zurück zur Beitragsübersicht",
        success: "Beitrag endgültig gelöscht",
      },
      post: {
        syndicate: "Beitrag syndizieren",
      },
      posts: {
        title: "Beiträge",
      },
      status: {
        unlisted: "Nicht gelistet",
      },
      filter: {
        type: "Typ",
        status: "Status",
        all: "Alle",
        status_published: "Veröffentlicht",
        status_draft: "Entwürfe",
        status_deleted: "Gelöscht",
        status_all: "Alle",
        searchPlaceholder: "Beiträge suchen…",
        searchButton: "Suchen",
        clear: "Zurücksetzen",
        newest: "Neueste",
        oldest: "Älteste",
        results: "Beiträge",
      },
      form: {
        summary: {
          label: "Zusammenfassung",
        },
        "mp-syndicate-to": {
          label: "Syndizieren nach",
        },
        pinned: {
          label: "Hervorgehobener Beitrag",
          no: "Nein",
          yes: "Ja – im Bereich Hervorgehoben anpinnen",
        },
        "ai-text-level": {
          label: "KI-Textebene",
          0: "0 – Keine",
          1: "1 – Redaktionelle Unterstützung",
          2: "2 – Ko-Erstellung",
          3: "3 – KI-generiert (menschlich geprüft)",
        },
        "ai-code-level": {
          label: "KI-Codeebene",
          0: "0 – Menschlich geschrieben",
          1: "1 – KI-unterstützt",
          2: "2 – Überwiegend KI-generiert",
        },
        "ai-tools": {
          label: "KI-Werkzeuge",
          placeholder: "z. B. Claude, ChatGPT, Copilot",
        },
        "ai-description": {
          label: "KI-Nutzungshinweis",
        },
      },
    },
  },
};

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeMissing(target, fallback) {
  if (target === undefined) {
    return fallback;
  }

  if (!isObject(target) || !isObject(fallback)) {
    return target;
  }

  const merged = { ...target };

  for (const [key, fallbackValue] of Object.entries(fallback)) {
    merged[key] = mergeMissing(merged[key], fallbackValue);
  }

  return merged;
}

function applyOverrides(target, overrides) {
  if (!isObject(target) || !isObject(overrides)) {
    return target;
  }

  const merged = { ...target };

  for (const [key, value] of Object.entries(overrides)) {
    if (isObject(value)) {
      const existing = isObject(merged[key]) ? merged[key] : {};
      merged[key] = applyOverrides(existing, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let checkedEndpoints = 0;
let checkedLocales = 0;
let patchedLocales = 0;

for (const endpointPath of endpointCandidates) {
  if (!(await exists(endpointPath))) {
    continue;
  }

  checkedEndpoints += 1;

  const sourcePath = path.join(endpointPath, "locales", `${sourceLocale}.json`);

  if (!(await exists(sourcePath))) {
    continue;
  }

  let sourceLocaleJson;
  try {
    sourceLocaleJson = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch {
    continue;
  }

  checkedLocales += 1;

  for (const locale of targetLocales) {
    const localePath = path.join(endpointPath, "locales", `${locale}.json`);
    checkedLocales += 1;

    let localeJson = {};
    if (await exists(localePath)) {
      try {
        localeJson = JSON.parse(await readFile(localePath, "utf8"));
      } catch {
        localeJson = {};
      }
    }

    const merged = mergeMissing(localeJson, sourceLocaleJson);
    const patched = applyOverrides(merged, localeOverrides[locale] || {});

    if (JSON.stringify(patched) === JSON.stringify(localeJson)) {
      continue;
    }

    await writeFile(localePath, `${JSON.stringify(patched, null, 2)}\n`, "utf8");
    patchedLocales += 1;
  }
}

if (checkedEndpoints === 0) {
  console.log("[postinstall] No posts endpoint directories found");
} else if (patchedLocales === 0) {
  console.log("[postinstall] posts locales already patched");
} else {
  console.log(
    `[postinstall] Patched posts locales in ${patchedLocales}/${checkedLocales} file(s)`,
  );
}
