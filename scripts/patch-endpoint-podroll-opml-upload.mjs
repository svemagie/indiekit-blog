import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const endpointCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-podroll",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-podroll",
];

const dashboardFormOld =
  '<form method="post" action="{{ mountPath }}/settings" class="podroll-form">';
const dashboardFormNew =
  '<form method="post" action="{{ mountPath }}/settings" class="podroll-form" enctype="multipart/form-data">';

const dashboardOpmlFieldOld = [
  '      <div class="podroll-field">',
  '        <label class="label" for="opmlUrl">{{ __("podroll.opmlUrl") }}</label>',
  '        <span class="hint" id="opmlUrl-hint">{{ __("podroll.opmlUrlHelp") }}</span>',
  '        <input class="input" type="url" id="opmlUrl" name="opmlUrl" value="{{ config.opmlUrl }}" aria-describedby="opmlUrl-hint" placeholder="https://...">',
  '      </div>',
].join("\n");

const dashboardOpmlFieldNew = [
  '      <div class="podroll-field">',
  '        <label class="label" for="opmlUrl">{{ __("podroll.opmlUrl") }}</label>',
  '        <span class="hint" id="opmlUrl-hint">{{ __("podroll.opmlUrlHelp") }}</span>',
  '        <input class="input" type="url" id="opmlUrl" name="opmlUrl" value="{{ config.opmlUrl }}" aria-describedby="opmlUrl-hint" placeholder="https://...">',
  '      </div>',
  '      <div class="podroll-field">',
  '        <label class="label" for="opmlFile">{{ __("podroll.opmlFile") }}</label>',
  '        <span class="hint" id="opmlFile-hint">{{ __("podroll.opmlFileHelp") }}</span>',
  '        <input class="input" type="file" id="opmlFile" name="opmlFile" accept=".opml,.xml,text/xml,application/xml" aria-describedby="opmlFile-hint">',
  '        {% if config.hasOpmlUpload %}',
  '        <p class="hint">{{ __("podroll.opmlFileActive") }}</p>',
  '        {% endif %}',
  '      </div>',
  '      <div class="podroll-field">',
  '        <label class="checkbox" for="clearOpmlFile">',
  '          <input type="checkbox" id="clearOpmlFile" name="clearOpmlFile" value="1">',
  '          {{ __("podroll.clearOpmlFile") }}',
  '        </label>',
  '      </div>',
].join("\n");

const controllerGetEffectiveOld = [
  '/**',
  ' * Get effective URLs: DB-stored settings override env var defaults',
  ' * @param {object} db - MongoDB database instance',
  ' * @param {object} podrollConfig - Plugin config from env vars',
  ' * @returns {Promise<object>} Effective episodesUrl and opmlUrl',
  ' */',
  'async function getEffectiveUrls(db, podrollConfig) {',
  '  let episodesUrl = podrollConfig?.episodesUrl || "";',
  '  let opmlUrl = podrollConfig?.opmlUrl || "";',
  '',
  '  if (db) {',
  '    const settings = await db',
  '      .collection("podrollMeta")',
  '      .findOne({ key: "settings" });',
  '    if (settings) {',
  '      if (settings.episodesUrl) episodesUrl = settings.episodesUrl;',
  '      if (settings.opmlUrl) opmlUrl = settings.opmlUrl;',
  '    }',
  '  }',
  '',
  '  return { episodesUrl, opmlUrl };',
  '}',
].join("\n");

const controllerGetEffectiveNew = [
  '/**',
  ' * Get effective podroll configuration: DB-stored settings override env var defaults',
  ' * @param {object} db - MongoDB database instance',
  ' * @param {object} podrollConfig - Plugin config from env vars',
  ' * @returns {Promise<object>} Effective episodesUrl, opmlUrl and opmlUpload',
  ' */',
  'async function getEffectiveUrls(db, podrollConfig) {',
  '  let episodesUrl = podrollConfig?.episodesUrl || "";',
  '  let opmlUrl = podrollConfig?.opmlUrl || "";',
  '  let opmlUpload = podrollConfig?.opmlUpload || "";',
  '',
  '  if (db) {',
  '    const settings = await db',
  '      .collection("podrollMeta")',
  '      .findOne({ key: "settings" });',
  '    if (settings) {',
  '      if (settings.episodesUrl) episodesUrl = settings.episodesUrl;',
  '      if (settings.opmlUrl) opmlUrl = settings.opmlUrl;',
  '      if (settings.opmlUpload) opmlUpload = settings.opmlUpload;',
  '    }',
  '  }',
  '',
  '  return { episodesUrl, opmlUrl, opmlUpload };',
  '}',
].join("\n");

const controllerConfigOld = [
  '        config: {',
  '          episodesUrl: urls.episodesUrl,',
  '          opmlUrl: urls.opmlUrl,',
  '          syncInterval: application.podrollConfig?.syncInterval || 900000,',
  '        },',
].join("\n");

const controllerConfigNew = [
  '        config: {',
  '          episodesUrl: urls.episodesUrl,',
  '          opmlUrl: urls.opmlUrl,',
  '          hasOpmlUpload: Boolean(urls.opmlUpload),',
  '          syncInterval: application.podrollConfig?.syncInterval || 900000,',
  '        },',
].join("\n");

const controllerSaveOld = [
  '      const { episodesUrl, opmlUrl } = request.body;',
  '',
  '      await db.collection("podrollMeta").updateOne(',
  '        { key: "settings" },',
  '        {',
  '          $set: {',
  '            key: "settings",',
  '            episodesUrl: episodesUrl || "",',
  '            opmlUrl: opmlUrl || "",',
  '            updatedAt: new Date().toISOString(),',
  '          },',
  '        },',
  '        { upsert: true },',
  '      );',
].join("\n");

const controllerSaveNew = [
  '      const { episodesUrl, opmlUrl, clearOpmlFile } = request.body;',
  '',
  '      const existingSettings = await db',
  '        .collection("podrollMeta")',
  '        .findOne({ key: "settings" });',
  '',
  '      let opmlUpload = existingSettings?.opmlUpload || "";',
  '',
  '      if (clearOpmlFile === "1") {',
  '        opmlUpload = "";',
  '      }',
  '',
  '      const uploadedFileRaw = request.files?.opmlFile;',
  '      const uploadedFile = Array.isArray(uploadedFileRaw)',
  '        ? uploadedFileRaw[0]',
  '        : uploadedFileRaw;',
  '',
  '      if (uploadedFile) {',
  '        const uploadedName = String(uploadedFile.name || "");',
  '        const uploadedType = String(uploadedFile.mimetype || "").toLowerCase();',
  '        const isXmlName = /\\.(opml|xml)$/i.test(uploadedName);',
  '        const isXmlType = uploadedType.includes("xml");',
  '',
  '        if (!isXmlName && !isXmlType) {',
  '          throw new Error(request.__("podroll.opmlFileInvalidType"));',
  '        }',
  '',
  '        if (uploadedFile.size > 1_048_576) {',
  '          throw new Error(request.__("podroll.opmlFileTooLarge"));',
  '        }',
  '',
  '        const opmlText = Buffer.from(uploadedFile.data).toString("utf8").trim();',
  '',
  '        if (!opmlText || !opmlText.toLowerCase().includes("<opml")) {',
  '          throw new Error(request.__("podroll.opmlFileInvalidContent"));',
  '        }',
  '',
  '        opmlUpload = opmlText;',
  '      }',
  '',
  '      await db.collection("podrollMeta").updateOne(',
  '        { key: "settings" },',
  '        {',
  '          $set: {',
  '            key: "settings",',
  '            episodesUrl: episodesUrl || "",',
  '            opmlUrl: opmlUrl || "",',
  '            opmlUpload,',
  '            updatedAt: new Date().toISOString(),',
  '          },',
  '        },',
  '        { upsert: true },',
  '      );',
].join("\n");

const controllerSyncBlockOld = [
  '      const syncOptions = {',
  '        ...application.podrollConfig,',
  '        episodesUrl: urls.episodesUrl,',
  '        opmlUrl: urls.opmlUrl,',
  '      };',
].join("\n");

const controllerSyncBlockNew = [
  '      const syncOptions = {',
  '        ...application.podrollConfig,',
  '        episodesUrl: urls.episodesUrl,',
  '        opmlUrl: urls.opmlUrl,',
  '        opmlUpload: urls.opmlUpload,',
  '      };',
].join("\n");

const syncSourcesHeadOld = [
  'async function syncSources(db, options) {',
  '  const { opmlUrl, fetchTimeout } = options;',
  '',
  '  if (!opmlUrl) {',
  '    return { success: false, error: "No opmlUrl configured" };',
  '  }',
  '',
  '  try {',
  '    console.log("[Podroll] Fetching OPML sources...");',
  '    const sources = await fetchOpmlSources(opmlUrl, fetchTimeout);',
].join("\n");

const syncSourcesHeadNew = [
  'async function syncSources(db, options) {',
  '  const { opmlUrl, opmlUpload, fetchTimeout } = options;',
  '',
  '  const hasUploadedOpml = Boolean(opmlUpload && opmlUpload.trim());',
  '  const hasRemoteOpml = Boolean(opmlUrl);',
  '',
  '  if (!hasUploadedOpml && !hasRemoteOpml) {',
  '    return { success: false, error: "No opml source configured" };',
  '  }',
  '',
  '  try {',
  '    const opmlSource = hasUploadedOpml',
  '      ? `data:text/xml;charset=utf-8,${encodeURIComponent(opmlUpload)}`',
  '      : opmlUrl;',
  '',
  '    if (hasUploadedOpml) {',
  '      console.log("[Podroll] Parsing uploaded OPML sources...");',
  '    } else {',
  '      console.log("[Podroll] Fetching OPML sources...");',
  '    }',
  '',
  '    const sources = await fetchOpmlSources(opmlSource, fetchTimeout);',
].join("\n");

const runSyncOld =
  '    options.opmlUrl ? syncSources(db, options) : { success: true, skipped: true },';
const runSyncNew =
  '    options.opmlUrl || options.opmlUpload ? syncSources(db, options) : { success: true, skipped: true },';

const effectiveOptionsOld = [
  '      return {',
  '        ...options,',
  '        episodesUrl: settings.episodesUrl || options.episodesUrl,',
  '        opmlUrl: settings.opmlUrl || options.opmlUrl,',
  '      };',
].join("\n");

const effectiveOptionsNew = [
  '      return {',
  '        ...options,',
  '        episodesUrl: settings.episodesUrl || options.episodesUrl,',
  '        opmlUrl: settings.opmlUrl || options.opmlUrl,',
  '        opmlUpload: settings.opmlUpload || options.opmlUpload,',
  '      };',
].join("\n");

const indexDefaultsOld = '  opmlUrl: "",';
const indexDefaultsNew = '  opmlUrl: "",\n  opmlUpload: "",';

const localeDefaults = {
  opmlFile: "Upload OPML file",
  opmlFileHelp:
    "Upload an OPML file to sync podcast subscriptions without a remote OPML URL",
  opmlFileActive:
    "An uploaded OPML file is currently saved and will be used during source sync",
  clearOpmlFile: "Remove saved uploaded OPML file",
  opmlFileInvalidType: "Please upload an .opml or .xml file",
  opmlFileInvalidContent: "Uploaded file is not valid OPML content",
  opmlFileTooLarge: "Uploaded OPML file is too large (max 1 MB)",
};

const deLocaleOverrides = {
  opmlFile: "OPML-Datei hochladen",
  opmlFileHelp:
    "Laden Sie eine OPML-Datei hoch, um Podcast-Abonnements ohne externe OPML-URL zu synchronisieren",
  opmlFileActive:
    "Eine hochgeladene OPML-Datei ist gespeichert und wird bei der Quellen-Synchronisierung verwendet",
  clearOpmlFile: "Gespeicherte hochgeladene OPML-Datei entfernen",
  opmlFileInvalidType: "Bitte eine .opml- oder .xml-Datei hochladen",
  opmlFileInvalidContent: "Die hochgeladene Datei enthaelt keinen gueltigen OPML-Inhalt",
  opmlFileTooLarge: "Die hochgeladene OPML-Datei ist zu gross (max. 1 MB)",
};

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function replaceOnce(source, from, to) {
  if (source.includes(to)) {
    return { updated: source, changed: false, status: "already" };
  }

  if (!source.includes(from)) {
    return { updated: source, changed: false, status: "missing" };
  }

  return {
    updated: source.replace(from, to),
    changed: true,
    status: "patched",
  };
}

function patchLocale(source, overrides = {}) {
  const parsed = JSON.parse(source);
  const podroll =
    parsed && parsed.podroll && typeof parsed.podroll === "object"
      ? parsed.podroll
      : {};

  let changed = false;
  for (const [key, value] of Object.entries(localeDefaults)) {
    if (!(key in podroll)) {
      podroll[key] = value;
      changed = true;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (podroll[key] !== value) {
      podroll[key] = value;
      changed = true;
    }
  }

  if (!changed) {
    return { updated: source, changed: false };
  }

  parsed.podroll = podroll;
  return { updated: `${JSON.stringify(parsed, null, 2)}\n`, changed: true };
}

let endpointsChecked = 0;
let filesPatched = 0;

for (const endpointPath of endpointCandidates) {
  if (!(await exists(endpointPath))) {
    continue;
  }

  endpointsChecked += 1;

  const dashboardPath = path.join(endpointPath, "views", "dashboard.njk");
  const controllerPath = path.join(
    endpointPath,
    "lib",
    "controllers",
    "dashboard.js",
  );
  const syncPath = path.join(endpointPath, "lib", "sync.js");
  const indexPath = path.join(endpointPath, "index.js");
  const enLocalePath = path.join(endpointPath, "locales", "en.json");
  const deLocalePath = path.join(endpointPath, "locales", "de.json");

  if (await exists(dashboardPath)) {
    let source = await readFile(dashboardPath, "utf8");
    let changed = false;

    const formResult = replaceOnce(source, dashboardFormOld, dashboardFormNew);
    source = formResult.updated;
    changed = changed || formResult.changed;

    const fieldResult = replaceOnce(source, dashboardOpmlFieldOld, dashboardOpmlFieldNew);
    source = fieldResult.updated;
    changed = changed || fieldResult.changed;

    if (changed) {
      await writeFile(dashboardPath, source, "utf8");
      filesPatched += 1;
    }
  }

  if (await exists(controllerPath)) {
    let source = await readFile(controllerPath, "utf8");
    let changed = false;

    const effectiveResult = replaceOnce(
      source,
      controllerGetEffectiveOld,
      controllerGetEffectiveNew,
    );
    source = effectiveResult.updated;
    changed = changed || effectiveResult.changed;

    const configResult = replaceOnce(source, controllerConfigOld, controllerConfigNew);
    source = configResult.updated;
    changed = changed || configResult.changed;

    const saveResult = replaceOnce(source, controllerSaveOld, controllerSaveNew);
    source = saveResult.updated;
    changed = changed || saveResult.changed;

    if (source.includes(controllerSyncBlockOld)) {
      source = source.replaceAll(controllerSyncBlockOld, controllerSyncBlockNew);
      changed = true;
    }

    if (changed) {
      await writeFile(controllerPath, source, "utf8");
      filesPatched += 1;
    }
  }

  if (await exists(syncPath)) {
    let source = await readFile(syncPath, "utf8");
    let changed = false;

    const syncSourcesResult = replaceOnce(
      source,
      syncSourcesHeadOld,
      syncSourcesHeadNew,
    );
    source = syncSourcesResult.updated;
    changed = changed || syncSourcesResult.changed;

    const runSyncResult = replaceOnce(source, runSyncOld, runSyncNew);
    source = runSyncResult.updated;
    changed = changed || runSyncResult.changed;

    const effectiveOptsResult = replaceOnce(
      source,
      effectiveOptionsOld,
      effectiveOptionsNew,
    );
    source = effectiveOptsResult.updated;
    changed = changed || effectiveOptsResult.changed;

    if (changed) {
      await writeFile(syncPath, source, "utf8");
      filesPatched += 1;
    }
  }

  if (await exists(indexPath)) {
    const source = await readFile(indexPath, "utf8");
    const result = replaceOnce(source, indexDefaultsOld, indexDefaultsNew);
    if (result.changed) {
      await writeFile(indexPath, result.updated, "utf8");
      filesPatched += 1;
    }
  }

  if (await exists(enLocalePath)) {
    const source = await readFile(enLocalePath, "utf8");
    const result = patchLocale(source);
    if (result.changed) {
      await writeFile(enLocalePath, result.updated, "utf8");
      filesPatched += 1;
    }
  }

  if (await exists(deLocalePath)) {
    const source = await readFile(deLocalePath, "utf8");
    const result = patchLocale(source, deLocaleOverrides);
    if (result.changed) {
      await writeFile(deLocalePath, result.updated, "utf8");
      filesPatched += 1;
    }
  }
}

if (endpointsChecked === 0) {
  console.log("[postinstall] No endpoint-podroll directories found");
} else if (filesPatched === 0) {
  console.log("[postinstall] endpoint-podroll OPML upload patch already applied");
} else {
  console.log(
    `[postinstall] Patched endpoint-podroll OPML upload in ${filesPatched} file(s)`,
  );
}
