/**
 * Patch: add search input and tag chips to the /posts list page.
 *
 * Part A – posts.js controller:
 *   - forward `category` and `search` query params to the Micropub source query
 *   - expose `item.tagLinks` (pre-encoded href + text) for each post
 *   - pass `activeCategory` and `activeSearch` to the template
 *
 * Part B – posts.njk view:
 *   - replace the cardGrid call with a custom loop that appends clickable
 *     tag chips under each card
 *   - add a search form above the grid
 */
import { access, readFile, writeFile } from "node:fs/promises";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ─── Part A: posts controller ────────────────────────────────────────────────

const controllerCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-posts/lib/controllers/posts.js",
  "node_modules/@indiekit/endpoint-posts/lib/controllers/posts.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-posts/lib/controllers/posts.js",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-posts/lib/controllers/posts.js",
];

const controllerMarker = "// search-tags controller patch";

// 1) forward category + search to the micropub URL
const oldForward = `    const { after, before, success } = request.query;
    const limit = Number(request.query.limit) || 12;

    const micropubUrl = new URL(application.micropubEndpoint);
    micropubUrl.searchParams.append("q", "source");
    micropubUrl.searchParams.append("limit", String(limit));

    if (after) {
      micropubUrl.searchParams.append("after", String(after));
    }

    if (before) {
      micropubUrl.searchParams.append("before", String(before));
    }`;

const newForward = `    // search-tags controller patch
    const { after, before, category, search, success } = request.query;
    const limit = Number(request.query.limit) || 12;

    const micropubUrl = new URL(application.micropubEndpoint);
    micropubUrl.searchParams.append("q", "source");
    micropubUrl.searchParams.append("limit", String(limit));

    if (after) {
      micropubUrl.searchParams.append("after", String(after));
    }

    if (before) {
      micropubUrl.searchParams.append("before", String(before));
    }

    if (category) {
      micropubUrl.searchParams.append("category", String(category));
    }

    if (search) {
      micropubUrl.searchParams.append("search", String(search));
    }`;

// 2) add tagLinks to each post item
const oldBadges = `        item.badges = getPostStatusBadges(item, response);

        return item;`;

const newBadges = `        item.badges = getPostStatusBadges(item, response);
        const rawTags = Array.isArray(item.category)
          ? item.category
          : item.category
          ? [item.category]
          : [];
        item.tagLinks = rawTags.map((t) => ({
          text: t,
          href: \`?category=\${encodeURIComponent(t)}\`,
        }));

        return item;`;

// 3) pass activeCategory + activeSearch to the render call
const oldRender = `      statusTypes,
      success,
    });`;

const newRender = `      statusTypes,
      success,
      activeCategory: category || "",
      activeSearch: search || "",
    });`;

// ─── Part B: posts view ───────────────────────────────────────────────────────

const viewCandidates = [
  "node_modules/@rmdes/indiekit-endpoint-posts/views/posts.njk",
  "node_modules/@indiekit/endpoint-posts/views/posts.njk",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-posts/views/posts.njk",
  "node_modules/@indiekit/indiekit/node_modules/@indiekit/endpoint-posts/views/posts.njk",
];

const viewMarker = "{# search-tags view patch #}";

const oldView = `{% extends "document.njk" %}

{% block content %}
  {%- if posts.length > 0 %}
  {{ cardGrid({
    cardSize: "16rem",
    items: posts
  }) }}
  {{ pagination(cursor) }}
  {%- else -%}
  {{ prose({ text: __("posts.posts.none") }) }}
  {%- endif %}
{% endblock %}`;

const newView = `{% extends "document.njk" %}
{# search-tags view patch #}
{% block content %}
  <form method="get" action="">
    <div style="display:flex;gap:0.5rem;align-items:flex-end;flex-wrap:wrap;margin-bottom:1.5rem">
      {{ input({
        name: "search",
        label: "Search",
        value: activeSearch,
        type: "search",
        optional: true,
        field: { classes: "-!-flex-grow" }
      }) }}
      {{ button({ text: "Search", type: "submit" }) }}
      {%- if activeSearch or activeCategory %}
      <a href="{{ parentUrl }}" class="button" style="align-self:flex-end">Clear</a>
      {%- endif %}
    </div>
  </form>
  {%- if activeCategory %}
  <p style="margin-bottom:1rem">Filtered by tag: <strong>{{ activeCategory }}</strong></p>
  {%- endif %}
  {%- if posts.length > 0 %}
  <ol class="card-grid" role="list" style="--min-card-size: 16rem">
    {%- for item in posts %}
    <li class="card-grid__item">
      {{ card(item) | indent(4) }}
      {%- if item.tagLinks and item.tagLinks.length > 0 %}
      <dl class="prose--caption" style="padding:0 1rem 0.75rem">
        <dt class="-!-visually-hidden">Tags</dt>
        {%- for tagLink in item.tagLinks %}
        <dd class="tag"><a href="{{ tagLink.href }}">{{ tagLink.text }}</a></dd>
        {%- endfor %}
      </dl>
      {%- endif %}
    </li>
    {%- endfor %}
  </ol>
  {{ pagination(cursor) }}
  {%- else -%}
  {{ prose({ text: __("posts.posts.none") }) }}
  {%- endif %}
{% endblock %}`;

// ─── Apply patches ────────────────────────────────────────────────────────────

let controllerChecked = 0;
let controllerPatched = 0;

for (const filePath of controllerCandidates) {
  if (!(await exists(filePath))) continue;
  controllerChecked += 1;

  let source = await readFile(filePath, "utf8");
  if (source.includes(controllerMarker)) continue;

  let changed = false;

  for (const [oldSnip, newSnip] of [
    [oldForward, newForward],
    [oldBadges, newBadges],
    [oldRender, newRender],
  ]) {
    if (!source.includes(oldSnip)) {
      console.warn(
        `[postinstall] posts search-tags: snippet not found in ${filePath}, skipping`,
      );
      changed = false;
      break;
    }
    source = source.replace(oldSnip, newSnip);
    changed = true;
  }

  if (changed) {
    await writeFile(filePath, source, "utf8");
    controllerPatched += 1;
  }
}

let viewChecked = 0;
let viewPatched = 0;

for (const filePath of viewCandidates) {
  if (!(await exists(filePath))) continue;
  viewChecked += 1;

  const source = await readFile(filePath, "utf8");
  if (source.includes(viewMarker)) continue;

  if (!source.includes(oldView)) {
    console.warn(
      `[postinstall] posts search-tags: view not found in ${filePath}, skipping`,
    );
    continue;
  }

  const updated = source.replace(oldView, newView);
  await writeFile(filePath, updated, "utf8");
  viewPatched += 1;
}

if (controllerChecked === 0 && viewChecked === 0) {
  console.log("[postinstall] No endpoint-posts files found");
} else {
  if (controllerPatched === 0 && controllerChecked > 0) {
    console.log("[postinstall] posts search-tags controller already patched");
  } else if (controllerPatched > 0) {
    console.log(
      `[postinstall] Patched posts search-tags controller in ${controllerPatched} file(s)`,
    );
  }
  if (viewPatched === 0 && viewChecked > 0) {
    console.log("[postinstall] posts search-tags view already patched");
  } else if (viewPatched > 0) {
    console.log(
      `[postinstall] Patched posts search-tags view in ${viewPatched} file(s)`,
    );
  }
}
