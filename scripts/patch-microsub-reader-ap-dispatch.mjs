import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "microsub-reader-fediverse-detection-and-ap-dispatch",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-microsub/lib/controllers/reader.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-microsub/lib/controllers/reader.js",
    ],
    replacements: [
      {
        // Extend detectProtocol to recognise more fediverse domains (e.g. troet.cafe)
        oldSnippet: [
          "function detectProtocol(url) {",
          "  if (!url || typeof url !== \"string\") return \"web\";",
          "  const lower = url.toLowerCase();",
          "  if (lower.includes(\"bsky.app\") || lower.includes(\"bluesky\")) return \"atmosphere\";",
          "  if (lower.includes(\"mastodon.\") || lower.includes(\"mstdn.\") || lower.includes(\"fosstodon.\") ||",
          "      lower.includes(\"pleroma.\") || lower.includes(\"misskey.\") || lower.includes(\"pixelfed.\")) return \"fediverse\";",
          "  return \"web\";",
          "}",
        ].join("\n"),
        newSnippet: [
          "function detectProtocol(url) {",
          "  if (!url || typeof url !== \"string\") return \"web\";",
          "  const lower = url.toLowerCase();",
          "  if (lower.includes(\"bsky.app\") || lower.includes(\"bluesky\")) return \"atmosphere\";",
          "  // Well-known fediverse software domain patterns",
          "  if (lower.includes(\"mastodon.\") || lower.includes(\"mstdn.\") || lower.includes(\"fosstodon.\") ||",
          "      lower.includes(\"troet.\") || lower.includes(\"social.\") || lower.includes(\"pleroma.\") ||",
          "      lower.includes(\"misskey.\") || lower.includes(\"pixelfed.\") || lower.includes(\"hachyderm.\") ||",
          "      lower.includes(\"infosec.exchange\") || lower.includes(\"chaos.social\")) return \"fediverse\";",
          "  return \"web\";",
          "}",
        ].join("\n"),
      },
      {
        // Replace naive Mastodon target matching with service-name-aware logic that also
        // handles same-instance URLs (e.g. troet.cafe) not in the hardcoded pattern list.
        oldSnippet: [
          "  if (interactionUrl && syndicationTargets.length > 0) {",
          "    const protocol = detectProtocol(interactionUrl);",
          "    for (const target of syndicationTargets) {",
          "      const targetId = (target.uid || target.name || \"\").toLowerCase();",
          "      if (protocol === \"atmosphere\" && (targetId.includes(\"bluesky\") || targetId.includes(\"bsky\"))) {",
          "        target.checked = true;",
          "      } else if (protocol === \"fediverse\" && (targetId.includes(\"mastodon\") || targetId.includes(\"mstdn\"))) {",
          "        target.checked = true;",
          "      }",
          "    }",
          "  }",
        ].join("\n"),
        newSnippet: [
          "  if (interactionUrl && syndicationTargets.length > 0) {",
          "    const protocol = detectProtocol(interactionUrl);",
          "",
          "    // Build set of Mastodon instance hostnames from configured targets so we can",
          "    // match same-instance URLs (e.g. troet.cafe) even if not in the hardcoded list.",
          "    const mastodonHostnames = new Set();",
          "    for (const t of syndicationTargets) {",
          "      if (t.service?.name?.toLowerCase() === \"mastodon\" && t.service?.url) {",
          "        try { mastodonHostnames.add(new URL(t.service.url).hostname.toLowerCase()); } catch { /* ignore */ }",
          "      }",
          "    }",
          "    let interactionHostname = \"\";",
          "    try { interactionHostname = new URL(interactionUrl).hostname.toLowerCase(); } catch { /* ignore */ }",
          "",
          "    for (const target of syndicationTargets) {",
          "      const targetId = (target.uid || target.name || \"\").toLowerCase();",
          "      // Identify a Mastodon target by service name (reliable) or legacy uid/name patterns",
          "      const isMastodonTarget =",
          "        target.service?.name?.toLowerCase() === \"mastodon\" ||",
          "        targetId.includes(\"mastodon\") ||",
          "        targetId.includes(\"mstdn\");",
          "",
          "      if (protocol === \"atmosphere\" && (targetId.includes(\"bluesky\") || targetId.includes(\"bsky\"))) {",
          "        target.checked = true;",
          "      } else if (isMastodonTarget && (protocol === \"fediverse\" || mastodonHostnames.has(interactionHostname))) {",
          "        // Auto-check Mastodon when:",
          "        // - the URL is from a known fediverse instance (mastodon.social, fosstodon.org, …)",
          "        // - OR the URL is from the same instance as our Mastodon syndicator (e.g. troet.cafe)",
          "        target.checked = true;",
          "      }",
          "    }",
          "  }",
        ].join("\n"),
      },
      {
        // After a successful Micropub post, dispatch native AP Like or Announce
        // from the blog's own fediverse identity (@svemagie@blog.giersig.eu).
        oldSnippet: [
          "      // Redirect back to reader with success message",
          "      return response.redirect(`${request.baseUrl}/channels`);",
        ].join("\n"),
        newSnippet: [
          "      // Dispatch native AP Like or Announce from the blog's own fediverse identity",
          "      const installedPlugins = request.app.locals.installedPlugins;",
          "      const apPlugin = installedPlugins",
          "        ? [...installedPlugins].find((p) => p.name === \"ActivityPub endpoint\")",
          "        : null;",
          "",
          "      if (apPlugin) {",
          "        const { application } = request.app.locals;",
          "        if (likeOf) {",
          "          apPlugin.likePost(likeOf, application?.collections).then((result) => {",
          "            if (!result.ok) console.warn(`[Microsub] AP Like failed: ${result.error}`);",
          "          }).catch((err) => console.warn(`[Microsub] AP Like error: ${err.message}`));",
          "        } else if (repostOf) {",
          "          apPlugin.boostPost(repostOf, application?.collections).then((result) => {",
          "            if (!result.ok) console.warn(`[Microsub] AP Boost failed: ${result.error}`);",
          "          }).catch((err) => console.warn(`[Microsub] AP Boost error: ${err.message}`));",
          "        }",
          "      }",
          "",
          "      // Redirect back to reader with success message",
          "      return response.redirect(`${request.baseUrl}/channels`);",
        ].join("\n"),
      },
    ],
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

let filesChecked = 0;
let filesPatched = 0;

for (const patchSpec of patchSpecs) {
  for (const filePath of patchSpec.candidates) {
    if (!(await exists(filePath))) {
      continue;
    }

    filesChecked += 1;

    const source = await readFile(filePath, "utf8");
    let updated = source;

    for (const replacement of patchSpec.replacements) {
      if (updated.includes(replacement.newSnippet)) {
        continue;
      }

      if (!updated.includes(replacement.oldSnippet)) {
        continue;
      }

      updated = updated.replace(replacement.oldSnippet, replacement.newSnippet);
    }

    if (updated === source) {
      continue;
    }

    await writeFile(filePath, updated, "utf8");
    filesPatched += 1;
  }
}

if (filesChecked === 0) {
  console.log("[postinstall] No microsub reader AP dispatch patch targets found");
} else if (filesPatched === 0) {
  console.log("[postinstall] microsub reader AP dispatch patch already applied");
} else {
  console.log(
    `[postinstall] Patched microsub reader fediverse detection + AP dispatch in ${filesPatched}/${filesChecked} file(s)`,
  );
}
