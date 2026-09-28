const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const {
  captureReview,
  readSafe,
  contained,
  normalizeScope,
  compareGraphs,
  TypeScriptSnapshotExtractor,
} = require("../dist");

function command(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_CONFIG_NOSYSTEM: "1",
    },
  }).trim();
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codemap-review-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  command(root, "init", "-b", "main");
  command(root, "config", "user.email", "test@example.invalid");
  command(root, "config", "user.name", "CodeMap Test");
  await fs.writeFile(path.join(root, ".gitignore"), "ignored.ts\n");
  await fs.writeFile(path.join(root, "a.ts"), "export const a = 1;\n");
  await fs.writeFile(path.join(root, "b.ts"), "export const b = 1;\n");
  command(root, "add", ".");
  command(root, "commit", "-m", "baseline");
  return root;
}
test("captures branch + staged + unstaged + untracked changes without touching Git state", async (t) => {
  const root = await fixture(t);
  const base = command(root, "rev-parse", "HEAD");
  command(root, "switch", "-c", "feature");
  await fs.writeFile(
    path.join(root, "a.ts"),
    'import "./b";\nexport const a = 2;\n',
  );
  command(root, "add", ".");
  command(root, "commit", "-m", "feature");
  await fs.writeFile(
    path.join(root, "b.ts"),
    'import "./a";\nexport const b = 2;\n',
  );
  command(root, "add", "b.ts");
  await fs.writeFile(
    path.join(root, "b.ts"),
    'import "./a";\nexport const b = 3;\n',
  );
  const unusual = "new space\n--file.ts";
  await fs.writeFile(path.join(root, unusual), "export {};");
  await fs.writeFile(path.join(root, "ignored.ts"), "export {};");
  const status = command(root, "status", "--porcelain=v1");
  const result = await captureReview({ root, base: "main", scope: ["src/"] });
  assert.equal(result.data.baseCommit, base);
  assert.deepEqual(
    result.data.files.map((f) => f.path),
    ["a.ts", "b.ts", unusual],
  );
  assert.equal(result.data.addedLinks.length, 2);
  assert.deepEqual(result.data.newCycles, [["a.ts", "b.ts"]]);
  assert.match(result.diffs["b.ts"].after, /b = 3/);
  assert.equal(command(root, "status", "--porcelain=v1"), status);
  await fs.writeFile(path.join(root, "b.ts"), "later edit");
  assert.match(result.diffs["b.ts"].after, /b = 3/);
});
test("uses merge base, excludes unrelated base changes, represents deletion and net cancellation", async (t) => {
  const root = await fixture(t);
  const base = command(root, "rev-parse", "HEAD");
  command(root, "switch", "-c", "feature");
  await fs.writeFile(path.join(root, "a.ts"), "temporary");
  command(root, "add", ".");
  command(root, "commit", "-m", "temporary");
  command(root, "switch", "main");
  await fs.writeFile(path.join(root, "base-only.ts"), "export {};");
  command(root, "add", ".");
  command(root, "commit", "-m", "base only");
  command(root, "switch", "feature");
  await fs.writeFile(path.join(root, "a.ts"), "export const a = 1;\n");
  await fs.unlink(path.join(root, "b.ts"));
  const result = await captureReview({ root, base: "main" });
  assert.equal(result.data.baseCommit, base);
  assert.deepEqual(
    result.data.files.map((f) => [f.path, f.status]),
    [["b.ts", "deleted"]],
  );
  assert.equal(result.diffs["b.ts"].after, "");
});
test("rejects unsafe bases, root mismatch, missing revisions and strict budgets", async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    captureReview({ root, base: "--output=bad" }),
    /Invalid base/,
  );
  await assert.rejects(
    captureReview({ root, base: "absent" }),
    /not found locally/,
  );
  await assert.rejects(
    captureReview({ root, base: "main", limits: { totalBytes: 1 } }),
    /byte budget/,
  );
  await assert.rejects(
    captureReview({ root, base: "main", limits: { files: 1 } }),
    /file-count/,
  );
  await assert.rejects(
    captureReview({ root, base: "main", limits: { timeMs: -1 } }),
    /timed out/,
  );
  await fs.mkdir(path.join(root, "sub"));
  await assert.rejects(
    captureReview({ root: path.join(root, "sub"), base: "main" }),
    /repository root/,
  );
  assert.throws(() => normalizeScope(["../outside"]), /relative/);
  assert.deepEqual(normalizeScope(["src\\auth\\"]), ["src/auth/"]);
});
test("symlinks, sibling-prefix paths, special and oversized files are excluded", async (t) => {
  const root = await fixture(t);
  const sibling = root + "-secret";
  await fs.mkdir(sibling);
  t.after(() => fs.rm(sibling, { recursive: true, force: true }));
  await fs.writeFile(path.join(sibling, "secret.ts"), "secret");
  await fs.symlink(
    path.join(sibling, "secret.ts"),
    path.join(root, "escape.ts"),
  );
  await assert.rejects(readSafe(root, "escape.ts", 1024), /excluded/);
  await assert.rejects(readSafe(root, "../secret", 1024), /Unsafe/);
  assert.equal(contained(root, sibling), false);
  assert.equal(contained(root, root), true);
  assert.equal(contained(root, path.join(root, "..cache")), true);
  await fs.writeFile(
    path.join(root, "large.ts"),
    Buffer.alloc(1024 * 1024 + 1),
  );
  const result = await captureReview({ root, base: "main" });
  assert.ok(result.data.issues.some((i) => i.path === "escape.ts"));
  assert.ok(result.data.issues.some((i) => i.path === "large.ts"));
  assert.equal(result.diffs["escape.ts"], undefined);
  assert.equal(result.diffs["large.ts"], undefined);
  if (process.platform !== "win32") {
    execFileSync("mkfifo", [path.join(root, "pipe.ts")]);
    await assert.rejects(readSafe(root, "pipe.ts", 1024), /excluded/);
  }
});
function extract(entries) {
  return new TypeScriptSnapshotExtractor().parse(
    {
      files: new Map(Object.entries(entries)),
      hashes: new Map(),
      modes: new Map(),
      issues: [],
    },
    "current",
  );
}

test("does not report shrinking an existing cyclic group as a newly introduced cycle", () => {
  const before = extract({
    "a.ts": 'import "./b";',
    "b.ts": 'import "./a"; import "./c";',
    "c.ts": 'import "./b";',
  }).graph;
  const after = extract({
    "a.ts": 'import "./b";',
    "b.ts": 'import "./a";',
    "c.ts": "export {};",
  }).graph;
  assert.deepEqual(compareGraphs(before, after).newCycles, []);
});

test("budgets are reserved before content allocation and changed files are rechecked", async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    readSafe(root, "a.ts", 1024, () => {
      throw new Error("budget reserved");
    }),
    /budget reserved/,
  );
  await assert.rejects(
    readSafe(root, "a.ts", 1024, () => {
      require("node:fs").renameSync(
        path.join(root, "a.ts"),
        path.join(root, "old.ts"),
      );
      require("node:fs").writeFileSync(path.join(root, "a.ts"), "replacement");
    }),
    /changed during capture/,
  );
});

test("reports unborn, disconnected and conflicted Git histories", async (t) => {
  const root = await fixture(t);
  command(root, "switch", "--orphan", "orphan");
  await assert.rejects(captureReview({ root, base: "main" }), /no HEAD/);
  await fs.writeFile(path.join(root, "other.ts"), "export {};");
  command(root, "add", ".");
  command(root, "commit", "-m", "unrelated");
  await assert.rejects(
    captureReview({ root, base: "main" }),
    /common ancestor/,
  );
  command(root, "switch", "main");
  command(root, "switch", "-c", "feature");
  await fs.writeFile(path.join(root, "a.ts"), "feature");
  command(root, "add", ".");
  command(root, "commit", "-m", "feature");
  command(root, "switch", "main");
  await fs.writeFile(path.join(root, "a.ts"), "main");
  command(root, "add", ".");
  command(root, "commit", "-m", "main");
  command(root, "switch", "feature");
  assert.throws(() => command(root, "merge", "main"));
  await assert.rejects(
    captureReview({ root, base: "main" }),
    /merge conflicts/,
  );
});

test("resolves changed aliases from their own snapshot and discloses invalid configuration", () => {
  const common = {
    "a.ts": 'import "@target";',
    "one.ts": "export {};",
    "two.ts": "export {};",
  };
  const before = extract({
    ...common,
    "tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","paths":{"@target":["one.ts"]}}}',
  }).graph;
  const after = extract({
    ...common,
    "tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","paths":{"@target":["two.ts"]}}}',
  }).graph;
  const delta = compareGraphs(before, after);
  assert.equal(delta.addedLinks[0].target, "two.ts");
  assert.equal(delta.removedLinks[0].target, "one.ts");
  const unsupported = extract({
    ...common,
    "tsconfig.json": '{"extends":"../outside.json"}',
  });
  assert.ok(unsupported.issues.some((i) => i.path === "tsconfig.json"));
  const malformed = extract({
    "a.ts": "export {};",
    "tsconfig.json": '{"compilerOptions":',
    "package.json": "[]",
  });
  assert.deepEqual(
    new Set(malformed.issues.map((i) => i.path)),
    new Set(["tsconfig.json", "package.json"]),
  );
});

test("package exports preserve condition order and explicit subpath exclusions", () => {
  const result = extract({
    "a.ts":
      'import "lib"; import "lib/hidden"; const required = require("lib/require");',
    "lib/package.json": JSON.stringify({
      name: "lib",
      exports: {
        ".": { default: "./default.ts", import: "./import.ts" },
        "./hidden": null,
        "./require": { import: "./import.ts", require: "./required.ts" },
        "./*": "./*.ts",
      },
    }),
    "lib/default.ts": "export {};",
    "lib/import.ts": "export {};",
    "lib/required.ts": "export {};",
    "lib/hidden.ts": "export {};",
  });
  assert.deepEqual(
    new Set(result.graph.links.map((link) => link.target)),
    new Set(["lib/default.ts", "lib/required.ts"]),
  );
  assert.ok(
    result.issues.some((issue) => issue.message.includes("lib/hidden")),
  );
});

test("supports repository roots ending in whitespace", async (t) => {
  const original = await fixture(t);
  const root = original + " ";
  await fs.rename(original, root);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const result = await captureReview({ root, base: "main" });
  assert.deepEqual(result.data.files, []);
});

test("handles the 1,000-node / 3,000-edge AST regression fixture", () => {
  const files = Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => [
      `n${i}.ts`,
      [1, 7, 31]
        .map((offset) => `import "./n${(i + offset) % 1000}";`)
        .join("\n"),
    ]),
  );
  const start = performance.now();
  const result = extract(files);
  assert.equal(result.graph.nodes.length, 1000);
  assert.equal(result.graph.links.length, 3000);
  assert.ok(
    performance.now() - start < 10000,
    "AST fixture exceeded 10 seconds",
  );
});
test("snapshot-local aliases, package exports and import classifications", () => {
  const result = extract({
    "tsconfig.json":
      '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
    "src/a.ts":
      'import type { B } from "@/b"; export type { B } from "./b"; const p = import("./b"); const q = require("./b"); import { x } from "@local/lib";',
    "src/b.ts": "export interface B {}",
    "packages/lib/package.json":
      '{"name":"@local/lib","exports":{".":{"import":"./src/index.ts"}}}',
    "packages/lib/src/index.ts": "export const x = 1;",
  });
  assert.deepEqual(
    new Set(
      result.graph.links
        .filter((l) => l.target === "src/b.ts")
        .map((l) => l.relation),
    ),
    new Set(["type-import", "dynamic-import", "dynamic-require"]),
  );
  assert.ok(
    result.graph.links.some((l) => l.target === "packages/lib/src/index.ts"),
  );
  assert.equal(result.issues.length, 0);
  const other = extract({ "a.ts": 'import "@/missing"; import(variable);' });
  assert.equal(other.graph.links.length, 0);
  assert.equal(other.issues.length, 2);
});
test("changed aliases resolve independently and type-only cycles are excluded", () => {
  const before = extract({
    "a.ts": 'import "./b";',
    "b.ts": "export {};",
  }).graph;
  const after = extract({
    "a.ts": 'import "./b";',
    "b.ts": 'import type {} from "./a";',
  }).graph;
  assert.deepEqual(compareGraphs(before, after).newCycles, []);
  assert.deepEqual(compareGraphs(after, after).addedLinks, []);
});

test("captures an on-disk monorepo with inherited aliases, package exports and JS extension substitution", async (t) => {
  const root = await fixture(t);
  const files = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "@shared/*": ["libs/shared/*"] },
      },
    }),
    "apps/web/tsconfig.json": '{"extends":"../../tsconfig.json"}',
    "apps/web/index.ts":
      'import "@shared/one"; import type { Contract } from "@fixture/contracts"; import("./lazy.js");',
    "apps/web/lazy.ts": "export {};",
    "libs/shared/one.ts": "export const one = 1;",
    "libs/shared/two.ts": "export const two = 2;",
    "packages/contracts/package.json":
      '{"name":"@fixture/contracts","exports":{".":{"types":"./src/types.ts","default":"./src/index.ts"}}}',
    "packages/contracts/src/types.ts": "export interface Contract {}",
    "packages/contracts/src/index.ts": "export {};",
  };
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), content);
  }
  command(root, "add", ".");
  command(root, "commit", "-m", "monorepo baseline");
  await fs.writeFile(
    path.join(root, "apps/web/tsconfig.json"),
    JSON.stringify({
      extends: "../../tsconfig.json",
      compilerOptions: { paths: { "@shared/*": ["libs/shared/two.ts"] } },
    }),
  );
  const result = await captureReview({ root, base: "main" });
  assert.deepEqual(
    result.data.addedLinks.map((link) => link.target),
    ["libs/shared/two.ts"],
  );
  assert.deepEqual(
    result.data.removedLinks.map((link) => link.target),
    ["libs/shared/one.ts"],
  );
  assert.ok(
    result.data.graph.links.some(
      (link) =>
        link.target === "packages/contracts/src/types.ts" &&
        link.relation === "type-import",
    ),
  );
  assert.ok(
    result.data.graph.links.some(
      (link) =>
        link.target === "apps/web/lazy.ts" &&
        link.relation === "dynamic-import",
    ),
  );
  assert.equal(
    result.data.issues.filter((issue) =>
      issue.message.includes("unresolved or external"),
    ).length,
    0,
  );
});
