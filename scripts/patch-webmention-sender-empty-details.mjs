/**
 * Patch @rmdes/indiekit-endpoint-webmention-sender template to:
 *
 * Show a "No external links found" message when a post was processed
 * but all sent/failed/skipped arrays are empty (i.e. no external links
 * were discovered in the post content at processing time).
 *
 * Without this patch the expanded detail row is completely blank, which
 * is confusing because the user can't tell whether something went wrong
 * or the post simply had no outbound links.
 */

import { access, readFile, writeFile } from "node:fs/promises";

const filePath =
  "node_modules/@rmdes/indiekit-endpoint-webmention-sender/views/webmention-sender.njk";

const patchMarker = "[patched:empty-details]";

const originalBlock = `              {% if result.details.skipped and result.details.skipped.length > 0 %}
              <h4 style="color: var(--color-text-muted, gray);">{{ __("webmention-sender.results.skippedLabel") }} ({{ result.details.skipped.length }})</h4>
              <table class="wm-detail-table">
                <thead>
                  <tr>
                    <th>{{ __("webmention-sender.results.target") }}</th>
                    <th>{{ __("webmention-sender.results.reason") }}</th>
                  </tr>
                </thead>
                <tbody>
                  {% for item in result.details.skipped %}
                  <tr>
                    <td><a href="{{ item.target }}" target="_blank" rel="noopener">{{ item.target | truncate(50) }}</a></td>
                    <td>{{ item.reason }}</td>
                  </tr>
                  {% endfor %}
                </tbody>
              </table>
              {% endif %}
            {% else %}
              <p class="wm-no-details">{{ __("webmention-sender.results.noDetails") }}</p>
            {% endif %}`;

const newBlock = `              {% if result.details.skipped and result.details.skipped.length > 0 %}
              <h4 style="color: var(--color-text-muted, gray);">{{ __("webmention-sender.results.skippedLabel") }} ({{ result.details.skipped.length }})</h4>
              <table class="wm-detail-table">
                <thead>
                  <tr>
                    <th>{{ __("webmention-sender.results.target") }}</th>
                    <th>{{ __("webmention-sender.results.reason") }}</th>
                  </tr>
                </thead>
                <tbody>
                  {% for item in result.details.skipped %}
                  <tr>
                    <td><a href="{{ item.target }}" target="_blank" rel="noopener">{{ item.target | truncate(50) }}</a></td>
                    <td>{{ item.reason }}</td>
                  </tr>
                  {% endfor %}
                </tbody>
              </table>
              {% endif %}

              {# [patched:empty-details] Show a message when details exist but all arrays are empty #}
              {% if not (result.details.sent and result.details.sent.length) and not (result.details.failed and result.details.failed.length) and not (result.details.skipped and result.details.skipped.length) %}
              <p class="wm-no-details">No external links discovered in this post.</p>
              {% endif %}
            {% else %}
              <p class="wm-no-details">{{ __("webmention-sender.results.noDetails") }}</p>
            {% endif %}`;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(filePath))) {
  console.log("[patch-webmention-sender-empty-details] File not found, skipping");
  process.exit(0);
}

const source = await readFile(filePath, "utf8");

if (source.includes(patchMarker)) {
  console.log("[patch-webmention-sender-empty-details] Already patched");
  process.exit(0);
}

if (!source.includes(originalBlock)) {
  console.warn(
    "[patch-webmention-sender-empty-details] Target block not found — upstream format may have changed, skipping"
  );
  process.exit(0);
}

const patched = source.replace(originalBlock, newBlock);

if (!patched.includes(patchMarker)) {
  console.warn("[patch-webmention-sender-empty-details] Patch validation failed, skipping");
  process.exit(0);
}

await writeFile(filePath, patched, "utf8");
console.log("[patch-webmention-sender-empty-details] Patched successfully");
