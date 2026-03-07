require("dotenv/config");
const { spawn } = require("child_process");

const args = [
	require.resolve("@indiekit/indiekit/bin/cli.js"),
	"serve",
	"--config",
	"indiekit.config.mjs",
];

const child = spawn(process.execPath, args, { stdio: "inherit" });

child.on("exit", (code) => {
	process.exit(code ?? 1);
});
