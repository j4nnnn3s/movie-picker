import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [{ name: "mobile-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    env: {
      TMDB_API_KEY: "test",
      LLM_PROVIDER: "gemini",
      LLM_MODEL: "gemini-3.1-flash-lite",
      LLM_API_KEY: "test",
      SITE_PASSWORD: "test-password",
      AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
    },
  },
});
