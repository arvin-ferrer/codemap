const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");

async function smoke() {
  const tarball = path.resolve(process.argv[2]);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "codemap-package-"));
  const installation = path.join(temp, "installation");
  const repo = path.join(temp, "workspace");
  let child;
  try {
    await fs.mkdir(installation);
    await fs.mkdir(repo);
    await fs.writeFile(
      path.join(installation, "package.json"),
      JSON.stringify({
        private: true,
        dependencies: { "@codemap/cli": "file:" + tarball },
      }),
    );
    try {
      // pnpm run exposes its JS entry point, avoiding Windows .cmd shell quoting.
      const pnpmEntry = process.env.npm_execpath;
      execFileSync(
        pnpmEntry ? process.execPath : "pnpm",
        [
          ...(pnpmEntry ? [pnpmEntry] : []),
          "install",
          "--prefer-offline",
          "--prod",
          "--ignore-scripts",
          "--dir",
          installation,
        ],
        { stdio: "pipe" },
      );
    } catch (error) {
      throw new Error(
        "Clean install failed: " + String(error.stdout ?? error.message),
      );
    }
    const git = (...args) =>
      execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    git("init", "-b", "main");
    git("config", "user.name", "Smoke Test");
    git("config", "user.email", "smoke@example.invalid");
    await fs.writeFile(path.join(repo, "a.ts"), "export const a = 1;");
    await fs.writeFile(path.join(repo, "b.ts"), "export {};");
    git("add", ".");
    git("commit", "-m", "base");
    await fs.writeFile(
      path.join(repo, "a.ts"),
      'import "./b"; export const a = 2;',
    );
    const before = git("status", "--porcelain=v1").toString();
    const binary = path.join(
      installation,
      "node_modules/@codemap/cli/bin/codemap.cjs",
    );
    // Windows child.kill forcibly terminates; console Ctrl+C needs a native terminal check.
    for (const signal of process.platform === "win32"
      ? ["SIGTERM"]
      : ["SIGINT", "SIGTERM"]) {
      child = spawn(
        process.execPath,
        [binary, "review", "--base", "main", "--scope", "a.ts", "--no-open"],
        { cwd: repo, stdio: ["ignore", "pipe", "pipe"] },
      );
      const url = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("CLI startup timed out")),
          20000,
        );
        let stdout = "";
        child.stdout.on("data", (buffer) => {
          stdout += buffer.toString();
          const match = stdout.match(
            /http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]+/,
          );
          if (match) {
            clearTimeout(timer);
            resolve(new URL(match[0]));
          }
        });
        child.stderr.resume();
        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(new Error("CLI exited during startup: " + code));
        });
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
      const headers = {
        Authorization:
          "Bearer " + new URLSearchParams(url.hash.slice(1)).get("token"),
      };
      assert.equal((await fetch(url.origin + "/api/review")).status, 401);
      assert.equal((await fetch(url.origin + "/API/REVIEW")).status, 401);
      assert.equal(
        (
          await fetch(url.origin + "/api/review", {
            headers: { ...headers, Origin: "https://evil.invalid" },
          })
        ).status,
        403,
      );
      const response = await fetch(url.origin + "/api/review", { headers });
      assert.equal(response.status, 200);
      const review = await response.json();
      assert.equal(review.files[0].path, "a.ts");
      assert.equal(review.addedLinks.length, 1);
      assert.deepEqual(review.initialScope, ["a.ts"]);
      const html = await (await fetch(url.origin)).text();
      assert.match(html, /CodeMap/);
      const assets = [...html.matchAll(/src="([^" ]+\.js)"/g)].map(
        (match) => match[1],
      );
      assert.ok(assets.length > 0);
      for (const asset of assets)
        assert.equal((await fetch(new URL(asset, url.origin))).status, 200);
      const refreshed = await (
        await fetch(url.origin + "/api/review/refresh", {
          method: "POST",
          headers,
        })
      ).json();
      assert.notEqual(refreshed.id, review.id);
      assert.equal(
        (
          await fetch(
            url.origin + "/api/review/diff?id=" + review.id + "&path=a.ts",
            { headers },
          )
        ).status,
        409,
      );
      const exited = new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("CLI did not stop")),
          5000,
        );
        child.once("exit", (code) => {
          clearTimeout(timer);
          code === 0 || process.platform === "win32"
            ? resolve()
            : reject(new Error("CLI exit code " + code));
        });
      });
      child.kill(signal);
      await exited;
      child = undefined;
      await assert.rejects(fetch(url.origin + "/api/review", { headers }));
      assert.equal(git("status", "--porcelain=v1").toString(), before);
      console.log(
        `Packed CLI: clean install, API/auth, static assets, refresh, ${signal} ${process.platform === "win32" ? "termination" : "graceful shutdown"} passed.`,
      );
    }
    if (process.argv.includes("--browser")) {
      execFileSync(
        process.execPath,
        [require.resolve("@playwright/test/cli"), "test"],
        {
          cwd: path.resolve(__dirname, ".."),
          env: { ...process.env, CODEMAP_TEST_CLI_BINARY: binary },
          stdio: "inherit",
          timeout: 300000,
        },
      );
    }
  } finally {
    child?.kill("SIGKILL");
    await fs.rm(temp, { recursive: true, force: true });
  }
}
smoke().catch((error) => {
  console.error(error instanceof Error ? error.message : "Packed smoke failed");
  process.exitCode = 1;
});
