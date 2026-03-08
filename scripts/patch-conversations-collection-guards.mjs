import { access, readFile, writeFile } from "node:fs/promises";

const candidates = [
  "node_modules/@rmdes/indiekit-endpoint-conversations/lib/storage/conversation-items.js",
  "node_modules/@indiekit/indiekit/node_modules/@rmdes/indiekit-endpoint-conversations/lib/storage/conversation-items.js",
];

const oldBlock = `function getCollection(application) {
  return application.collections.get("conversation_items");
}`;

const newBlock = `const emptyCursor = {
  sort() {
    return this;
  },
  skip() {
    return this;
  },
  limit() {
    return this;
  },
  async toArray() {
    return [];
  },
};

const emptyCollection = {
  find() {
    return emptyCursor;
  },
  aggregate() {
    return { toArray: async () => [] };
  },
  async countDocuments() {
    return 0;
  },
  async findOneAndUpdate() {
    return null;
  },
  async deleteMany() {
    return { deletedCount: 0 };
  },
  async createIndex() {
    return null;
  },
};

function getCollection(application) {
  return application?.collections?.get?.("conversation_items") || emptyCollection;
}`;

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

  if (source.includes("const emptyCollection = {")) {
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
  console.log("[postinstall] No conversations storage files found");
} else if (patched === 0) {
  console.log("[postinstall] conversations storage guards already patched");
} else {
  console.log(`[postinstall] Patched conversations storage guards in ${patched} file(s)`);
}
