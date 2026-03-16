/**
 * Patch: silently ignore PeerTube View (WatchAction) activities in the inbox.
 *
 * PeerTube broadcasts a non-standard ActivityStreams `View` activity to all
 * followers whenever someone watches a video. Fedify has no built-in handler
 * registered for this type, which causes a noisy
 * "Unsupported activity type" error in the federation inbox log on every view.
 *
 * Fix: register a no-op `.on(View, ...)` handler at the end of the inbox
 * listener chain so Fedify accepts and silently discards these activities
 * instead of logging them as errors.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/inbox-listeners.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/inbox-listeners.js",
];

const patchSpecs = [
  {
    name: "inbox-ignore-view-activity-import",
    marker: "// View imported",
    oldSnippet: `  Undo,
  Update,
} from "@fedify/fedify/vocab";`,
    newSnippet: `  Undo,
  Update,
  View, // View imported
} from "@fedify/fedify/vocab";`,
  },
  {
    name: "inbox-ignore-view-activity-handler",
    marker: "// PeerTube View handler",
    oldSnippet: `        console.info(\`[ActivityPub] Flag received from \${reporterName} — \${reportedIds.length} objects reported\`);
      } catch (error) {
        console.warn("[ActivityPub] Flag handler error:", error.message);
      }
    });
}`,
    newSnippet: `        console.info(\`[ActivityPub] Flag received from \${reporterName} — \${reportedIds.length} objects reported\`);
      } catch (error) {
        console.warn("[ActivityPub] Flag handler error:", error.message);
      }
    })
    // ── View (PeerTube watch) ─────────────────────────────────────────────
    // PeerTube broadcasts View (WatchAction) activities to all followers
    // whenever someone watches a video. Fedify has no built-in handler for
    // this type, producing noisy "Unsupported activity type" log errors.
    // Silently accept and discard. // PeerTube View handler
    .on(View, async () => {});
}`,
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

  for (const filePath of candidates) {
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

    const updated = source.replace(spec.oldSnippet, spec.newSnippet);

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
  console.log("[postinstall] No inbox-listeners files found for View activity patch");
} else if (patchedFiles.size === 0) {
  console.log("[postinstall] inbox-ignore-view-activity patches already applied");
} else {
  console.log(
    `[postinstall] Patched inbox-ignore-view-activity in ${patchedFiles.size}/${checkedFiles.size} file(s)`,
  );
}
