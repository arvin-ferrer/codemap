const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawn } = require("node:child_process");

async function fixture(large = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codemap-browser-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-b", "main");
  git("config", "user.name", "Browser Test");
  git("config", "user.email", "browser@example.invalid");
  git("config", "core.autocrlf", "false");
  await fs.mkdir(path.join(root, "src"));
  const files = large
    ? Object.fromEntries(
        Array.from({ length: 1000 }, (_, i) => [
          `src/n${i}.ts`,
          [1, 7, 31]
            .map((offset) => `import "./n${(i + offset) % 1000}";`)
            .join("\n"),
        ]),
      )
    : {
        "src/a.ts": "export const version = 1;",
        "src/b.ts": "export const b = 1;",
        "src/deleted.ts": "export const removed = true;",
      };
  for (const [file, text] of Object.entries(files))
    await fs.writeFile(path.join(root, file), text);
  git("add", ".");
  git("commit", "-m", "baseline");
  if (large) {
    for (const [file, text] of Object.entries(files))
      await fs.writeFile(path.join(root, file), "// changed\n" + text);
  } else {
    await fs.writeFile(
      path.join(root, "src/a.ts"),
      'import "./b"; export const version = 2;',
    );
    await fs.writeFile(
      path.join(root, "src/b.ts"),
      'import "./a"; export const b = 2;',
    );
    await fs.unlink(path.join(root, "src/deleted.ts"));
    await fs.writeFile(
      path.join(root, "outside.ts"),
      "export const outside = true;",
    );
  }
  const child = spawn(
    process.execPath,
    [
      process.env.CODEMAP_TEST_CLI_BINARY ??
        path.resolve(__dirname, "../../bin/codemap.cjs"),
      "review",
      "--no-open",
    ],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stderr.resume();
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("CLI startup timed out")),
      70000,
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#token=[a-f0-9]+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited: ${code}`));
    });
  }).catch(async (error) => {
    child.kill();
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  });
  return {
    root,
    url,
    async close() {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;
      await fs.rm(root, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      });
    },
  };
}

async function observeBrowser(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__layout = {
      ticks: 0,
      workers: 0,
      ids: [],
      links: 0,
      positions: [],
      messages: [],
      invalid: false,
    };
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args) {
        super(...args);
        window.__layout.workers++;
        this.addEventListener("message", ({ data }) => {
          if (data.type === "TICK") {
            window.__layout.ticks++;
            window.__layout.invalid ||=
              !(data.positions instanceof Float32Array) ||
              !data.positions.every(Number.isFinite);
            window.__layout.positions = Array.from(data.positions);
          }
        });
      }
      postMessage(message, ...args) {
        window.__layout.messages.push(message.type);
        if (message.type === "INIT") {
          window.__layout.ids = message.nodes.map((node) => node.id);
          window.__layout.links = message.links.length;
        }
        return super.postMessage(message, ...args);
      }
    };
  });
  return errors;
}

test("production CLI: scope, captured diffs, navigation, refresh and resize", async ({
  page,
}, testInfo) => {
  const app = await fixture();
  const errors = await observeBrowser(page);
  try {
    await page.goto(app.url);
    await expect(
      page.getByText("Scope not set", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__layout.ticks))
      .toBeGreaterThan(2);
    await expect(
      page.getByText("Loading graph…", { exact: true }),
    ).toBeHidden();
    expect(new URL(page.url()).hash).toBe("");
    await page.getByLabel("src/", { exact: true }).check();
    await page.getByRole("button", { name: "Set expected scope" }).click();
    await expect(
      page.getByText("1 outside expected scope", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /deleted src\/deleted.ts/ }).click();
    await expect(page.getByLabel("Captured text diff")).toContainText(
      "- export const removed = true;",
    );
    await page.getByRole("button", { name: /modified src\/a.ts/ }).click();
    await expect(page.getByLabel("Captured text diff")).toContainText(
      "version = 2",
    );
    await fs.writeFile(
      path.join(app.root, "src/a.ts"),
      'import "./b"; export const version = 3;',
    );
    await expect(page.getByLabel("Captured text diff")).not.toContainText(
      "version = 3",
    );
    await page.getByRole("button", { name: "Refresh snapshot" }).click();
    await expect(
      page.getByRole("button", { name: "Refresh snapshot" }),
    ).toBeEnabled();
    await expect(
      page.getByText("1 outside expected scope", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /modified src\/a.ts/ }).click();
    await expect(page.getByLabel("Captured text diff")).toContainText(
      "version = 3",
    );
    await page.getByPlaceholder("Search files...").fill("a.ts");
    await page
      .locator("li")
      .filter({ hasText: /^a\.tssrc\/a\.ts$/ })
      .click();
    const canvas = page.getByLabel(/dependency graph canvas/);
    await canvas.scrollIntoViewIfNeeded();
    const transform = () =>
      canvas.evaluate((element) => {
        const m = element.getContext("2d").getTransform();
        return { a: m.a, e: m.e, f: m.f };
      });
    await canvas.focus();
    const before = await transform();
    await canvas.press("ArrowRight");
    await expect.poll(async () => (await transform()).e).toBeLessThan(before.e);
    await canvas.press("+");
    await expect
      .poll(async () => (await transform()).a)
      .toBeGreaterThan(before.a);
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 20, box.y + box.height - 40);
    const panBefore = await transform();
    await page.mouse.down();
    await page.mouse.move(box.x + 70, box.y + box.height - 60, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => (await transform()).e)
      .toBeGreaterThan(panBefore.e);
    const zoomBefore = await transform();
    await page.mouse.wheel(0, -100);
    await expect
      .poll(async () => (await transform()).a)
      .toBeGreaterThan(zoomBefore.a);
    const position = await page.evaluate(() => {
      const i = window.__layout.ids.indexOf("src/a.ts");
      const c = document.querySelector("canvas");
      const rect = c.getBoundingClientRect();
      const m = c.getContext("2d").getTransform();
      return {
        x:
          rect.x +
          (window.__layout.positions[i * 2] * m.a + m.e) / devicePixelRatio,
        y:
          rect.y +
          (window.__layout.positions[i * 2 + 1] * m.d + m.f) / devicePixelRatio,
      };
    });
    await page.mouse.move(position.x, position.y);
    await page.mouse.down();
    await page.mouse.move(position.x + 30, position.y + 20, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.__layout.messages))
      .toContain("DRAG_END");
    await page.setViewportSize({ width: 760, height: 850 });
    await expect
      .poll(() =>
        canvas.evaluate((c) =>
          Math.abs(
            c.width - c.getBoundingClientRect().width * devicePixelRatio,
          ),
        ),
      )
      .toBeLessThanOrEqual(1);
    expect(await canvas.evaluate((c) => c.height)).toBeGreaterThan(0);
    const devtools = await page.context().newCDPSession(page);
    await devtools.send("Emulation.setDeviceMetricsOverride", {
      width: 760,
      height: 850,
      deviceScaleFactor: 3,
      mobile: false,
    });
    await expect
      .poll(() =>
        canvas.evaluate((c) =>
          Math.abs(
            c.width - c.getBoundingClientRect().width * devicePixelRatio,
          ),
        ),
      )
      .toBeLessThanOrEqual(1);
    await page
      .getByRole("heading", { name: "Review the shape of your change." })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("review.png") });
    expect(await page.evaluate(() => window.__layout.invalid)).toBe(false);
    await page.reload();
    await expect(
      page.getByText("Scope not set", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__layout.ticks))
      .toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test("1000-node production canvas remains responsive", async ({
  page,
}, testInfo) => {
  const app = await fixture(true);
  const errors = await observeBrowser(page);
  try {
    await page.goto(app.url);
    await expect
      .poll(() => page.evaluate(() => window.__layout.positions.length))
      .toBe(2000);
    expect(await page.evaluate(() => window.__layout.links)).toBe(3000);
    const canvas = page.getByLabel(/dependency graph canvas/);
    await canvas.scrollIntoViewIfNeeded();
    const metrics = await page.evaluate(async () => {
      const samples = [];
      const ticks = window.__layout.ticks;
      const start = performance.now();
      let previous = start;
      await new Promise((resolve) => {
        const frame = (now) => {
          samples.push(now - previous);
          previous = now;
          if (samples.length >= 120) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const elapsed = performance.now() - start;
      samples.sort((a, b) => a - b);
      return {
        meanFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length,
        p95FrameMs: samples[Math.floor(samples.length * 0.95)],
        workerMessagesPerSecond:
          ((window.__layout.ticks - ticks) * 1000) / elapsed,
        browserHeapMiB: performance.memory?.usedJSHeapSize / 1024 / 1024,
      };
    });
    console.log(
      "Browser canvas metrics",
      testInfo.project.name,
      JSON.stringify(metrics),
    );
    await testInfo.attach("canvas-metrics", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    expect(metrics.meanFrameMs).toBeLessThan(34);
    expect(metrics.p95FrameMs).toBeLessThan(60);
    expect(metrics.workerMessagesPerSecond).toBeGreaterThan(5);
    await page.getByPlaceholder("Search files...").fill("n123.ts");
    await expect(
      page.locator("li").filter({ hasText: /^n123\.tssrc\/n123\.ts$/ }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__layout.invalid)).toBe(false);
  } finally {
    await app.close();
  }
});
