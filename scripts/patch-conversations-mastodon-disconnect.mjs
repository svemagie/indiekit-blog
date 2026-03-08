import { access, readFile, writeFile } from "node:fs/promises";

const conversationsIndexCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-conversations/index.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-conversations/index.js",
];

const conversationsControllerCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-conversations/lib/controllers/conversations.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-conversations/lib/controllers/conversations.js",
];

const conversationsSchedulerCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-conversations/lib/polling/scheduler.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-conversations/lib/polling/scheduler.js",
];

const conversationsViewCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-conversations/views/conversations.njk",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-conversations/views/conversations.njk",
];

const patchSpecs = [
  {
    name: "conversations-index-mastodon-disconnect-routes",
    candidates: conversationsIndexCandidates,
    oldSnippet: `    // Manual poll trigger (admin only)
    router.post("/poll", conversationsController.triggerPoll);

    return router;`,
    newSnippet: `    // Manual poll trigger (admin only)
    router.post("/poll", conversationsController.triggerPoll);
    router.post("/mastodon/logout", conversationsController.logoutMastodon);
    router.post("/mastodon/reconnect", conversationsController.reconnectMastodon);

    return router;`,
  },
  {
    name: "conversations-dashboard-connection-state",
    candidates: conversationsControllerCandidates,
    marker: "const connectionState = {",
    oldSnippet: `    // Get stats
    const totalItems = await getConversationCount(application);`,
    newSnippet: `    const connectionState = {
      mastodonEnabled:
        !!config.mastodonEnabled && !pollState?.mastodon_disabled,
      blueskyEnabled: !!config.blueskyEnabled,
      activitypubEnabled: !!config.activitypubEnabled,
    };

    // Get stats
    const totalItems = await getConversationCount(application);`,
  },
  {
    name: "conversations-dashboard-render-connection-state",
    candidates: conversationsControllerCandidates,
    oldSnippet: `      config,
      pollState,
      totalItems,`,
    newSnippet: `      config,
      pollState,
      connectionState,
      totalItems,`,
  },
  {
    name: "conversations-dashboard-error-render-connection-state",
    candidates: conversationsControllerCandidates,
    oldSnippet: `      config: {},
      totalItems: 0,`,
    newSnippet: `      config: {},
      connectionState: {
        mastodonEnabled: false,
        blueskyEnabled: false,
        activitypubEnabled: false,
      },
      totalItems: 0,`,
  },
  {
    name: "conversations-status-mastodon-disabled-flag",
    candidates: conversationsControllerCandidates,
    oldSnippet: `    const totalItems = await getConversationCount(application);

    response.json({
      status: "ok",
      mastodon: {
        enabled: !!config.mastodonEnabled,`,
    newSnippet: `    const totalItems = await getConversationCount(application);
    const mastodonEnabled =
      !!config.mastodonEnabled && !pollState?.mastodon_disabled;

    response.json({
      status: "ok",
      mastodon: {
        enabled: mastodonEnabled,
        disabledByAdmin: !!pollState?.mastodon_disabled,`,
  },
  {
    name: "conversations-controller-mastodon-disconnect-handlers",
    candidates: conversationsControllerCandidates,
    marker: "async function logoutMastodon(request, response)",
    oldSnippet: `/**
 * Ingest a webmention`,
    newSnippet: `/**
 * Disable Mastodon polling (dashboard logout/disconnect action)
 * POST /conversations/mastodon/logout
 */
async function logoutMastodon(request, response) {
  const { application } = request.app.locals;
  const config = application?.conversations || {};
  const stateCollection = application?.collections?.get("conversation_state");

  try {
    if (stateCollection) {
      await stateCollection.findOneAndUpdate(
        { _id: "poll_cursors" },
        {
          $set: {
            mastodon_disabled: true,
            mastodon_last_error: null,
            mastodon_last_poll: new Date().toISOString(),
            mastodon_last_disabled_at: new Date().toISOString(),
          },
          $unset: {
            mastodon_since_id: "",
          },
        },
        { upsert: true },
      );
    }

    response.redirect((config.mountPath || "/conversations") + "?mastodon=logged_out");
  } catch (error) {
    console.error("[Conversations] Mastodon logout error:", error.message);
    response.redirect(
      (config.mountPath || "/conversations") + "?error=mastodon_logout_failed",
    );
  }
}

/**
 * Re-enable Mastodon polling after dashboard disconnect
 * POST /conversations/mastodon/reconnect
 */
async function reconnectMastodon(request, response) {
  const { application } = request.app.locals;
  const config = application?.conversations || {};
  const stateCollection = application?.collections?.get("conversation_state");

  try {
    if (stateCollection) {
      await stateCollection.findOneAndUpdate(
        { _id: "poll_cursors" },
        {
          $unset: {
            mastodon_disabled: "",
          },
          $set: {
            mastodon_last_error: null,
            mastodon_last_poll: new Date().toISOString(),
          },
        },
        { upsert: true },
      );
    }

    response.redirect((config.mountPath || "/conversations") + "?mastodon=reconnected");
  } catch (error) {
    console.error("[Conversations] Mastodon reconnect error:", error.message);
    response.redirect(
      (config.mountPath || "/conversations") + "?error=mastodon_reconnect_failed",
    );
  }
}

/**
 * Ingest a webmention`,
  },
  {
    name: "conversations-controller-export-disconnect-handlers",
    candidates: conversationsControllerCandidates,
    oldSnippet: `  triggerPoll,
  ingest,`,
    newSnippet: `  triggerPoll,
  logoutMastodon,
  reconnectMastodon,
  ingest,`,
  },
  {
    name: "conversations-scheduler-mastodon-disabled-check",
    candidates: conversationsSchedulerCandidates,
    oldSnippet: `  const mastodonToken = process.env.MASTODON_ACCESS_TOKEN;
  const hasMastodon = mastodonUrl && mastodonToken;`,
    newSnippet: `  const mastodonToken = process.env.MASTODON_ACCESS_TOKEN;
  const mastodonDisabled = state.mastodon_disabled === true;
  const hasMastodon = !mastodonDisabled && mastodonUrl && mastodonToken;`,
  },
  {
    name: "conversations-scheduler-mastodon-403-backoff",
    candidates: conversationsSchedulerCandidates,
    oldSnippet: `    if (error.status === 429 || error.status === 401) {`,
    newSnippet: `    if (error.status === 429 || error.status === 401 || error.status === 403) {`,
  },
  {
    name: "conversations-view-mastodon-connection-state",
    candidates: conversationsViewCandidates,
    oldSnippet: "config.mastodonEnabled",
    newSnippet: "connectionState.mastodonEnabled",
    replaceAll: true,
  },
  {
    name: "conversations-view-bluesky-connection-state",
    candidates: conversationsViewCandidates,
    oldSnippet: "config.blueskyEnabled",
    newSnippet: "connectionState.blueskyEnabled",
    replaceAll: true,
  },
  {
    name: "conversations-view-activitypub-connection-state",
    candidates: conversationsViewCandidates,
    oldSnippet: "config.activitypubEnabled",
    newSnippet: "connectionState.activitypubEnabled",
    replaceAll: true,
  },
  {
    name: "conversations-view-mastodon-logout-button",
    candidates: conversationsViewCandidates,
    marker: "action=\"{{ baseUrl }}/mastodon/logout\"",
    oldSnippet: `        <p style="font-size: 0.85em; margin: 0.25rem 0">
          {{ platformCounts.mastodon or 0 }} {{ __("conversations.dashboard.itemsCollected") }}
        </p>`,
    newSnippet: `        <p style="font-size: 0.85em; margin: 0.25rem 0">
          {{ platformCounts.mastodon or 0 }} {{ __("conversations.dashboard.itemsCollected") }}
        </p>
        <form method="post" action="{{ baseUrl }}/mastodon/logout" style="margin-top: 0.75rem">
          <button type="submit" class="button">Logout Mastodon</button>
        </form>`,
  },
  {
    name: "conversations-view-mastodon-disabled-state",
    candidates: conversationsViewCandidates,
    marker: "Mastodon polling is disconnected for this dashboard.",
    oldSnippet: `      {% else %}
        <p style="font-size: 0.85em; color: #6b7280; margin: 0.25rem 0">
          {{ __("conversations.dashboard.mastodonHint") }}
        </p>
      {% endif %}`,
    newSnippet: `      {% else %}
        {% if pollState and pollState.mastodon_disabled %}
        <p style="font-size: 0.85em; color: #6b7280; margin: 0.25rem 0">
          Mastodon polling is disconnected for this dashboard.
        </p>
        <form method="post" action="{{ baseUrl }}/mastodon/reconnect" style="margin-top: 0.75rem">
          <button type="submit" class="button">Reconnect Mastodon</button>
        </form>
        {% else %}
        <p style="font-size: 0.85em; color: #6b7280; margin: 0.25rem 0">
          {{ __("conversations.dashboard.mastodonHint") }}
        </p>
        {% endif %}
      {% endif %}`,
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

const checkedFiles = new Set();
const patchedFiles = new Set();

for (const spec of patchSpecs) {
  let foundAnyTarget = false;

  for (const filePath of spec.candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    foundAnyTarget = true;
    checkedFiles.add(filePath);

    const source = await readFile(filePath, "utf8");

    if (spec.marker && source.includes(spec.marker)) {
      continue;
    }

    if (!source.includes(spec.oldSnippet)) {
      continue;
    }

    let updated;
    if (spec.replaceAll) {
      updated = source.split(spec.oldSnippet).join(spec.newSnippet);
    } else {
      updated = source.replace(spec.oldSnippet, spec.newSnippet);
    }

    if (updated === source) {
      continue;
    }

    await writeFile(filePath, updated, "utf8");
    patchedFiles.add(filePath);
  }

  if (!foundAnyTarget) {
    console.log(`[postinstall] ${spec.name}: no target files found`);
  }
}

if (checkedFiles.size === 0) {
  console.log("[postinstall] No conversations mastodon disconnect files found");
} else if (patchedFiles.size === 0) {
  console.log("[postinstall] conversations mastodon disconnect patches already applied");
} else {
  console.log(
    `[postinstall] Patched conversations mastodon disconnect in ${patchedFiles.size}/${checkedFiles.size} file(s)`,
  );
}
