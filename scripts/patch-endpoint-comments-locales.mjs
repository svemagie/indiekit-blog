import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const endpointCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-comments",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-comments",
];

const sourceLocale = "en";
const targetLocales = [
  "de",
  "es",
  "fr",
  "nl",
  "pt",
  "sv",
  "es-419",
  "pt-BR",
  "hi",
  "id",
  "it",
  "pl",
  "sr",
  "zh-Hans-CN",
];

const localeAliases = {
  "es-419": "es",
  "pt-BR": "pt",
};

const localeOverrides = {
  de: {
    comments: {
      title: "Kommentare",
      dashboard: {
        stats: "Statistiken",
        totalComments: "Kommentare gesamt",
        thisWeek: "Diese Woche",
        uniqueCommenters: "Einzigartige Kommentierende",
        hiddenComments: "Versteckte Kommentare",
        commentList: "Kommentarliste",
        filterAll: "Alle",
        filterPublic: "Oeffentlich",
        filterHidden: "Versteckt",
        hide: "Verstecken",
        purge: "Endgueltig loeschen",
        purgeConfirm: "Sicher?",
        restore: "Wiederherstellen",
        noComments: "Noch keine Kommentare.",
        recentActivity: "Letzte Aktivitaet",
        commentPosted: "Kommentar veroeffentlicht",
        commentHidden: "Kommentar versteckt",
        commentPurged: "Kommentar geloescht",
        commentRestored: "Kommentar wiederhergestellt",
        previous: "Zurueck",
        next: "Weiter",
      },
      api: {
        rateLimited: "Zu viele Kommentare. Bitte spaeter erneut versuchen.",
        authRequired: "Bitte anmelden, um zu kommentieren.",
        commentTooLong: "Kommentar ist zu lang.",
        commentEmpty: "Kommentar darf nicht leer sein.",
        posted: "Kommentar erfolgreich veroeffentlicht.",
      },
    },
  },
  es: {
    comments: {
      title: "Comentarios",
      dashboard: {
        stats: "Estadisticas",
        totalComments: "Comentarios totales",
        thisWeek: "Esta semana",
        uniqueCommenters: "Comentaristas unicos",
        hiddenComments: "Comentarios ocultos",
        commentList: "Lista de comentarios",
        filterAll: "Todos",
        filterPublic: "Publicos",
        filterHidden: "Ocultos",
        hide: "Ocultar",
        purge: "Eliminar definitivamente",
        purgeConfirm: "Seguro?",
        restore: "Restaurar",
        noComments: "Aun no hay comentarios.",
        recentActivity: "Actividad reciente",
        commentPosted: "Comentario publicado",
        commentHidden: "Comentario ocultado",
        commentPurged: "Comentario eliminado",
        commentRestored: "Comentario restaurado",
        previous: "Anterior",
        next: "Siguiente",
      },
      api: {
        rateLimited: "Demasiados comentarios. Intentalo mas tarde.",
        authRequired: "Inicia sesion para comentar.",
        commentTooLong: "El comentario supera la longitud maxima.",
        commentEmpty: "El comentario no puede estar vacio.",
        posted: "Comentario publicado correctamente.",
      },
    },
  },
  fr: {
    comments: {
      title: "Commentaires",
      dashboard: {
        stats: "Statistiques",
        totalComments: "Total des commentaires",
        thisWeek: "Cette semaine",
        uniqueCommenters: "Commentateurs uniques",
        hiddenComments: "Commentaires masques",
        commentList: "Liste des commentaires",
        filterAll: "Tous",
        filterPublic: "Publics",
        filterHidden: "Masques",
        hide: "Masquer",
        purge: "Supprimer definitivement",
        purgeConfirm: "Confirmer?",
        restore: "Restaurer",
        noComments: "Aucun commentaire pour le moment.",
        recentActivity: "Activite recente",
        commentPosted: "Commentaire publie",
        commentHidden: "Commentaire masque",
        commentPurged: "Commentaire supprime",
        commentRestored: "Commentaire restaure",
        previous: "Precedent",
        next: "Suivant",
      },
      api: {
        rateLimited: "Trop de commentaires. Reessayez plus tard.",
        authRequired: "Connectez-vous pour commenter.",
        commentTooLong: "Le commentaire depasse la longueur maximale.",
        commentEmpty: "Le commentaire ne peut pas etre vide.",
        posted: "Commentaire publie avec succes.",
      },
    },
  },
  nl: {
    comments: {
      title: "Reacties",
      dashboard: {
        stats: "Statistieken",
        totalComments: "Totaal reacties",
        thisWeek: "Deze week",
        uniqueCommenters: "Unieke reageerders",
        hiddenComments: "Verborgen reacties",
        commentList: "Reactielijst",
        filterAll: "Alles",
        filterPublic: "Openbaar",
        filterHidden: "Verborgen",
        hide: "Verbergen",
        purge: "Definitief verwijderen",
        purgeConfirm: "Weet je het zeker?",
        restore: "Herstellen",
        noComments: "Nog geen reacties.",
        recentActivity: "Recente activiteit",
        commentPosted: "Reactie geplaatst",
        commentHidden: "Reactie verborgen",
        commentPurged: "Reactie verwijderd",
        commentRestored: "Reactie hersteld",
        previous: "Vorige",
        next: "Volgende",
      },
      api: {
        rateLimited: "Te veel reacties. Probeer later opnieuw.",
        authRequired: "Meld je aan om te reageren.",
        commentTooLong: "Reactie is te lang.",
        commentEmpty: "Reactie mag niet leeg zijn.",
        posted: "Reactie succesvol geplaatst.",
      },
    },
  },
  pt: {
    comments: {
      title: "Comentarios",
      dashboard: {
        stats: "Estatisticas",
        totalComments: "Total de comentarios",
        thisWeek: "Esta semana",
        uniqueCommenters: "Comentadores unicos",
        hiddenComments: "Comentarios ocultos",
        commentList: "Lista de comentarios",
        filterAll: "Todos",
        filterPublic: "Publicos",
        filterHidden: "Ocultos",
        hide: "Ocultar",
        purge: "Excluir permanentemente",
        purgeConfirm: "Tem certeza?",
        restore: "Restaurar",
        noComments: "Ainda nao ha comentarios.",
        recentActivity: "Atividade recente",
        commentPosted: "Comentario publicado",
        commentHidden: "Comentario ocultado",
        commentPurged: "Comentario removido",
        commentRestored: "Comentario restaurado",
        previous: "Anterior",
        next: "Proximo",
      },
      api: {
        rateLimited: "Muitos comentarios. Tente novamente mais tarde.",
        authRequired: "Faca login para comentar.",
        commentTooLong: "O comentario excede o tamanho maximo.",
        commentEmpty: "O comentario nao pode estar vazio.",
        posted: "Comentario publicado com sucesso.",
      },
    },
  },
  sv: {
    comments: {
      title: "Kommentarer",
      dashboard: {
        stats: "Statistik",
        totalComments: "Totalt antal kommentarer",
        thisWeek: "Denna vecka",
        uniqueCommenters: "Unika kommentatorer",
        hiddenComments: "Dolda kommentarer",
        commentList: "Kommentarslista",
        filterAll: "Alla",
        filterPublic: "Offentliga",
        filterHidden: "Dolda",
        hide: "Dolj",
        purge: "Radera permanent",
        purgeConfirm: "Ar du saker?",
        restore: "Aterstall",
        noComments: "Inga kommentarer annu.",
        recentActivity: "Senaste aktivitet",
        commentPosted: "Kommentar publicerad",
        commentHidden: "Kommentar dold",
        commentPurged: "Kommentar raderad",
        commentRestored: "Kommentar aterstalld",
        previous: "Foregaende",
        next: "Nasta",
      },
      api: {
        rateLimited: "For manga kommentarer. Forsok igen senare.",
        authRequired: "Logga in for att kommentera.",
        commentTooLong: "Kommentaren overskrider maximal langd.",
        commentEmpty: "Kommentaren kan inte vara tom.",
        posted: "Kommentar publicerad.",
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
    const overrideKey = localeAliases[locale] || locale;
    const patched = applyOverrides(merged, localeOverrides[overrideKey] || {});

    if (JSON.stringify(patched) === JSON.stringify(localeJson)) {
      continue;
    }

    await writeFile(localePath, `${JSON.stringify(patched, null, 2)}\n`, "utf8");
    patchedLocales += 1;
  }
}

if (checkedEndpoints === 0) {
  console.log("[postinstall] No comments endpoint directories found");
} else if (patchedLocales === 0) {
  console.log("[postinstall] comments locales already patched");
} else {
  console.log(
    `[postinstall] Patched comments locales in ${patchedLocales}/${checkedLocales} file(s)`,
  );
}
