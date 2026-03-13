import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  // compose.js: createPublicationAwareDocumentLoader and rawDocumentLoader wrapping
  // are now built into the fork — no patch needed.
  {
    name: "activitypub-resolve-author-publication-private-docloader",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/resolve-author.js",
      "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-activitypub/lib/resolve-author.js",
    ],
    replacements: [
      {
        oldSnippet: [
          "}",
          "",
          "/**",
          " * Resolve the author Actor for a given post URL.",
        ].join("\n"),
        newSnippet: [
          "}",
          "",
          "function createPublicationAwareDocumentLoader(documentLoader, publicationUrl) {",
          "  if (typeof documentLoader !== \"function\") {",
          "    return documentLoader;",
          "  }",
          "",
          "  let publicationHost = \"\";",
          "  try {",
          "    publicationHost = new URL(publicationUrl).hostname;",
          "  } catch {",
          "    return documentLoader;",
          "  }",
          "",
          "  return (url, options = {}) => {",
          "    try {",
          "      const parsed = new URL(",
          "        typeof url === \"string\" ? url : (url?.href || String(url)),",
          "      );",
          "      if (parsed.hostname === publicationHost) {",
          "        return documentLoader(url, { ...options, allowPrivateAddress: true });",
          "      }",
          "    } catch {",
          "      // Fall through to default loader behavior.",
          "    }",
          "",
          "    return documentLoader(url, options);",
          "  };",
          "}",
          "",
          "/**",
          " * Resolve the author Actor for a given post URL.",
        ].join("\n"),
      },
      {
        oldSnippet: [
          "export async function resolveAuthor(",
          "  postUrl,",
          "  ctx,",
          "  documentLoader,",
          "  collections,",
          ") {",
          "  // Strategy 1: Look up remote post via Fedify (signed request)",
        ].join("\n"),
        newSnippet: [
          "export async function resolveAuthor(",
          "  postUrl,",
          "  ctx,",
          "  documentLoader,",
          "  collections,",
          ") {",
          "  const publicationLoader = createPublicationAwareDocumentLoader(",
          "    documentLoader,",
          "    ctx?.url?.href || \"\",",
          "  );",
          "",
          "  // Strategy 1: Look up remote post via Fedify (signed request)",
        ].join("\n"),
      },
      {
        oldSnippet: [
          "    const remoteObject = await ctx.lookupObject(new URL(postUrl), {",
          "      documentLoader,",
          "    });",
          "    if (remoteObject && typeof remoteObject.getAttributedTo === \"function\") {",
          "      const author = await remoteObject.getAttributedTo({ documentLoader });",
        ].join("\n"),
        newSnippet: [
          "    const remoteObject = await ctx.lookupObject(new URL(postUrl), {",
          "      documentLoader: publicationLoader,",
          "    });",
          "    if (remoteObject && typeof remoteObject.getAttributedTo === \"function\") {",
          "      const author = await remoteObject.getAttributedTo({",
          "        documentLoader: publicationLoader,",
          "      });",
        ].join("\n"),
      },
      {
        oldSnippet: [
          "        const actor = await ctx.lookupObject(new URL(authorUrl), {",
          "          documentLoader,",
          "        });",
        ].join("\n"),
        newSnippet: [
          "        const actor = await ctx.lookupObject(new URL(authorUrl), {",
          "          documentLoader: publicationLoader,",
          "        });",
        ].join("\n"),
      },
      {
        oldSnippet: [
          "      const actor = await ctx.lookupObject(new URL(extractedUrl), {",
          "        documentLoader,",
          "      });",
        ].join("\n"),
        newSnippet: [
          "      const actor = await ctx.lookupObject(new URL(extractedUrl), {",
          "        documentLoader: publicationLoader,",
          "      });",
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
  console.log("[postinstall] No activitypub private-url patch targets found");
} else if (filesPatched === 0) {
  console.log("[postinstall] activitypub private-url docloader patch already applied");
} else {
  console.log(
    `[postinstall] Patched activitypub publication-host private-url handling in ${filesPatched}/${filesChecked} file(s)`,
  );
}