const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.PORT || 4317;
const BASE_URL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run web",
    url: `${BASE_URL}/healthz`,
    reuseExistingServer: true,
    timeout: 30000
  }
});
