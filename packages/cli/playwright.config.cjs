const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/browser",
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    browserName: "chromium",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { deviceScaleFactor: 1 } },
    { name: "chromium-hidpi", use: { deviceScaleFactor: 2 } },
  ],
});
