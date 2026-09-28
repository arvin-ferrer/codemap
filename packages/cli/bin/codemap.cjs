#!/usr/bin/env node
const path = require("node:path");
const { spawn } = require("node:child_process");

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  if (args.shift() !== "review")
    throw new Error(
      "Usage: codemap review [--base main] [--scope src/auth/] [--no-open]",
    );
  const options = { base: "main", scope: [], open: true };
  while (args.length) {
    const flag = args.shift();
    if (flag === "--no-open") options.open = false;
    else if (flag === "--base" || flag === "--scope") {
      const value = args.shift();
      if (!value || value.startsWith("-"))
        throw new Error(`${flag} requires a value.`);
      if (flag === "--base") options.base = value;
      else options.scope.push(value);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}
function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32.exe"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { shell: false, stdio: "ignore" });
  child.on("error", () =>
    console.error("Browser could not open. Use the session URL shown above."),
  );
  child.on("exit", (code) => {
    if (code)
      console.error("Browser could not open. Use the session URL shown above.");
  });
  child.unref();
}
async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(
      "codemap review [--base main] [--scope src/auth/] [--no-open]\nRun at the Git root. Reviews branch changes and local edits. Scope folders end in /.",
    );
    return;
  }
  const { startReviewServer } = require("../dist/backend/server.js");
  const server = await startReviewServer({
    root: process.cwd(),
    base: options.base,
    scope: options.scope,
    assets: path.join(__dirname, "../public"),
  });
  // Explicit user-facing bootstrap URL; no server/request logging of the token.
  console.log(
    `CodeMap review: ${server.url}\nKeep this session URL private. Press Ctrl+C to stop.`,
  );
  if (options.open) openBrowser(server.url);
  let closing = false;
  const stop = () => {
    if (!closing) {
      closing = true;
      void server.close().then(() => {
        process.exitCode = 0;
      });
    }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
module.exports = { parseArgs, main };
if (require.main === module)
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "CodeMap could not start.",
    );
    process.exitCode = 1;
  });
