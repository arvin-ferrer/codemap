const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs } = require("../bin/codemap.cjs");
test("review defaults and repeated scope options", () => {
  assert.deepEqual(parseArgs(["review"]), {
    base: "main",
    scope: [],
    open: true,
  });
  assert.deepEqual(
    parseArgs([
      "review",
      "--base",
      "develop",
      "--scope",
      "src/",
      "--scope",
      "package.json",
      "--no-open",
    ]),
    { base: "develop", scope: ["src/", "package.json"], open: false },
  );
  assert.deepEqual(parseArgs(["--help"]), { help: true });
});
test("rejects unknown commands, flags and missing values", () => {
  for (const args of [
    [],
    ["serve"],
    ["review", "--wat"],
    ["review", "--base"],
    ["review", "--scope", "--no-open"],
  ])
    assert.throws(() => parseArgs(args));
});
