import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const endpointCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-homepage",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-homepage",
];

const sourceLocale = "en";
const targetLocales = ["de"];

const deOverrides = {
  homepageBuilder: {
    tabs: {
      builder: "Homepage",
      blogSidebar: "Blog-Sidebar",
      identity: "Identitaet",
    },
    identity: {
      title: "Identitaet",
      description:
        "Konfigurieren Sie Ihr Autorenprofil, Kontaktdaten und Social-Links. Diese ueberschreiben Standardwerte aus Umgebungsvariablen.",
      saved:
        "Identitaet erfolgreich gespeichert. Aktualisieren Sie Ihre Website, um die Aenderungen zu sehen.",
      profile: {
        legend: "Profil",
        name: {
          label: "Name",
          hint: "Ihr Anzeigename",
        },
        avatar: {
          label: "Avatar-URL",
          hint: "URL zu Ihrem Avatarbild",
        },
        title: {
          label: "Titel",
          hint: "Berufsbezeichnung oder Untertitel",
        },
        pronoun: {
          label: "Pronomen",
          hint: "z. B. er/ihm, sie/ihr, they/them",
        },
        bio: {
          label: "Bio",
          hint: "Kurze Biografie",
        },
        description: {
          label: "Website-Beschreibung",
          hint: "Beschreibung, die im Hero-Bereich angezeigt wird",
        },
      },
      location: {
        legend: "Standort",
        locality: {
          label: "Stadt",
          hint: "Stadt oder Ort",
        },
        country: {
          label: "Land",
        },
        org: {
          label: "Organisation",
          hint: "Unternehmen oder Organisation",
        },
      },
      contact: {
        legend: "Kontakt",
        url: {
          label: "URL",
          hint: "URL Ihrer persoenlichen Website",
        },
        email: {
          label: "E-Mail",
        },
        keyUrl: {
          label: "PGP-Schluessel-URL",
          hint: "URL zu Ihrem oeffentlichen PGP-Schluessel",
        },
      },
      categories: {
        legend: "Website-Kategorien",
        tags: {
          label: "Kategorien",
          hint:
            "Kommagetrennte Tags fuer Ihre Website (werden als p-category in Ihrer h-card gerendert)",
        },
      },
      social: {
        legend: "Social-Links",
        description:
          "Fuegen Sie Links zu Ihren Social-Profilen hinzu. Diese erscheinen im Hero-Bereich und in der h-card.",
        name: {
          label: "Name",
        },
        url: {
          label: "URL",
        },
        rel: {
          label: "Rel",
        },
        icon: {
          label: "Icon",
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
    const patched = locale === "de" ? applyOverrides(merged, deOverrides) : merged;

    if (JSON.stringify(patched) === JSON.stringify(localeJson)) {
      continue;
    }

    await writeFile(localePath, `${JSON.stringify(patched, null, 2)}\n`, "utf8");
    patchedLocales += 1;
  }
}

if (checkedEndpoints === 0) {
  console.log("[postinstall] No homepage endpoint directories found");
} else if (checkedLocales === 0) {
  console.log("[postinstall] No homepage locale files checked");
} else if (patchedLocales === 0) {
  console.log("[postinstall] homepage locale files already patched");
} else {
  console.log(
    `[postinstall] Patched homepage locale files in ${patchedLocales}/${checkedLocales} file(s)`,
  );
}