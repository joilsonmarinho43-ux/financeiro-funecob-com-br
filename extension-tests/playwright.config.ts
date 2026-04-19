import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false, // extensions need a single browser context
  workers: 1,
  reporter: [["list"]],
  use: {
    headless: false, // required for Chrome extensions (MV3 service worker)
    viewport: { width: 1280, height: 800 },
  },
});
