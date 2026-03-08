import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@indiekit/indiekit/views/session/login.njk",
];

const oldBlock = `  {{ button({
    text: __("session.login.submit"),
    classes: "button--block"
  }) | indent(2) }}
{% endblock %}`;

const newBlock = `  {{ button({
    text: __("session.login.submit"),
    classes: "button--block"
  }) | indent(2) }}

  <noscript>
    <p>After continuing, enter your password on the next page.</p>
  </noscript>

  <script>
    if (!new URLSearchParams(window.location.search).has("noautocontinue")) {
      window.addEventListener("load", () => {
        const form = document.querySelector("main form[method='post']");
        if (form) {
          form.requestSubmit();
        }
      });
    }
  </script>
{% endblock %}`;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

let checked = 0;
let patched = 0;

for (const filePath of candidates) {
  if (!(await exists(filePath))) {
    continue;
  }

  checked += 1;

  const source = await readFile(filePath, "utf8");

  if (source.includes("noautocontinue")) {
    continue;
  }

  if (!source.includes(oldBlock)) {
    continue;
  }

  const updated = source.replace(oldBlock, newBlock);
  await writeFile(filePath, updated, "utf8");
  patched += 1;
}

if (checked === 0) {
  console.log("[postinstall] No session login templates found");
} else if (patched === 0) {
  console.log("[postinstall] session login auto-continue already patched");
} else {
  console.log(`[postinstall] Patched session login auto-continue in ${patched} file(s)`);
}
