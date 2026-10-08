import { defineConfig, devices } from "@playwright/test";
import { parsePort } from "./scripts/ssg/serve-core";

// PORT inválida lança um erro em português (parsePort) em vez de cair silenciosamente em 4000
const PORT = parsePort(process.env.PORT);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "bun run build && bun run preview",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { PORT: String(PORT) },
    timeout: 120000,
  },
});
