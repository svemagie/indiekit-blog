import "dotenv/config";

import bcrypt from "bcrypt";

const strictMode = process.env.REQUIRE_SECURITY !== "0";
const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();

function failOrWarn(message) {
  if (strictMode) {
    console.error(message);
    process.exit(1);
  }

  console.warn(`${message} Continuing because strict mode is disabled.`);
}

if (nodeEnv !== "production") {
  failOrWarn(
    `[preflight] NODE_ENV must be "production" for secure startup (received "${process.env.NODE_ENV || "(unset)"}").`,
  );
}

if (process.env.INDIEKIT_ALLOW_DEV_AUTH === "1") {
  failOrWarn(
    "[preflight] INDIEKIT_ALLOW_DEV_AUTH=1 is not allowed in production.",
  );
}

const secret = process.env.SECRET || "";
if (secret.length < 32) {
  failOrWarn(
    "[preflight] SECRET must be set and at least 32 characters long.",
  );
}

const passwordSecret = process.env.PASSWORD_SECRET || "";
if (!passwordSecret) {
  failOrWarn("[preflight] PASSWORD_SECRET is required.");
}

if (!/^\$2[aby]\$\d{2}\$/.test(passwordSecret)) {
  failOrWarn(
    "[preflight] PASSWORD_SECRET must be a bcrypt hash (starts with $2a$, $2b$, or $2y$).",
  );
}

try {
  const emptyPasswordValid = await bcrypt.compare("", passwordSecret);
  if (emptyPasswordValid) {
    failOrWarn(
      "[preflight] PASSWORD_SECRET matches an empty password. Generate a non-empty password hash via /auth/new-password.",
    );
  }
} catch (error) {
  failOrWarn(
    `[preflight] PASSWORD_SECRET could not be validated with bcrypt: ${error.message}`,
  );
}

if (process.env.INDIEKIT_PASSWORD) {
  console.warn(
    "[preflight] INDIEKIT_PASSWORD is set but ignored by core auth. Use PASSWORD_SECRET only.",
  );
}

console.log("[preflight] Production auth configuration OK");
