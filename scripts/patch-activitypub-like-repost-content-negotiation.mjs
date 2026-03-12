import { access, readFile, writeFile } from "node:fs/promises";

const patchSpecs = [
  {
    name: "activitypub-like-repost-content-negotiation-as-note",
    candidates: [
      "node_modules/@rmdes/indiekit-endpoint-activitypub/lib/jf2-to-as2.js",
    ],
    replacements: [
      {
        // Serve like/repost posts as Note objects for content negotiation.
        // Returning a bare Like/Announce activity breaks Mastodon's
        // authorize_interaction because it expects a content object (Note/Article).
        oldSnippet: [
          "  if (postType === \"like\") {",
          "    return {",
          "      \"@context\": \"https://www.w3.org/ns/activitystreams\",",
          "      type: \"Like\",",
          "      actor: actorUrl,",
          "      object: properties[\"like-of\"],",
          "    };",
          "  }",
          "",
          "  if (postType === \"repost\") {",
          "    return {",
          "      \"@context\": \"https://www.w3.org/ns/activitystreams\",",
          "      type: \"Announce\",",
          "      actor: actorUrl,",
          "      object: properties[\"repost-of\"],",
          "    };",
          "  }",
        ].join("\n"),
        newSnippet: [
          "  if (postType === \"like\") {",
          "    // Serve like posts as Note objects for AP content negotiation.",
          "    // Returning a bare Like activity breaks Mastodon's authorize_interaction",
          "    // flow because it expects a content object (Note/Article), not an activity.",
          "    const likeOf = properties[\"like-of\"];",
          "    const postUrl = resolvePostUrl(properties.url, publicationUrl);",
          "    return {",
          '      "@context": "https://www.w3.org/ns/activitystreams",',
          '      type: "Note",',
          "      id: postUrl,",
          "      attributedTo: actorUrl,",
          "      published: properties.published,",
          "      url: postUrl,",
          '      to: ["https://www.w3.org/ns/activitystreams#Public"],',
          '      cc: [`${actorUrl.replace(/\\/$/, "")}/followers`],',
          '      content: `\\u2764\\uFE0F <a href="${likeOf}">${likeOf}</a>`,',
          "    };",
          "  }",
          "",
          "  if (postType === \"repost\") {",
          "    // Same rationale as like — serve as Note for content negotiation.",
          "    const repostOf = properties[\"repost-of\"];",
          "    const postUrl = resolvePostUrl(properties.url, publicationUrl);",
          "    return {",
          '      "@context": "https://www.w3.org/ns/activitystreams",',
          '      type: "Note",',
          "      id: postUrl,",
          "      attributedTo: actorUrl,",
          "      published: properties.published,",
          "      url: postUrl,",
          '      to: ["https://www.w3.org/ns/activitystreams#Public"],',
          '      cc: [`${actorUrl.replace(/\\/$/, "")}/followers`],',
          '      content: `\\u{1F501} <a href="${repostOf}">${repostOf}</a>`,',
          "    };",
          "  }",
        ].join("\n"),
      },
    ],
  },
];

async function applyPatch(spec) {
  let filePath = null;
  for (const candidate of spec.candidates) {
    try {
      await access(candidate);
      filePath = candidate;
      break;
    } catch {
      // try next
    }
  }

  if (!filePath) {
    console.warn(`[postinstall] ${spec.name}: no candidate file found, skipping`);
    return;
  }

  let content = await readFile(filePath, "utf8");

  for (const { oldSnippet, newSnippet } of spec.replacements) {
    if (content.includes(newSnippet)) {
      continue; // already applied
    }
    if (!content.includes(oldSnippet)) {
      console.warn(`[postinstall] ${spec.name}: expected snippet not found in ${filePath}`);
      continue;
    }
    content = content.replace(oldSnippet, newSnippet);
  }

  await writeFile(filePath, content, "utf8");
  console.log(`[postinstall] ${spec.name} patch applied to ${filePath}`);
}

(async () => {
  for (const spec of patchSpecs) {
    await applyPatch(spec);
  }
})();
