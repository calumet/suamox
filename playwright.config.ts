import { defineConfig } from "@playwright/test";

const DEV_PORT = 3000;
const PROD_PORT = 3001;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: 0,
  projects: [
    {
      name: "dev",
      use: { baseURL: `http://localhost:${DEV_PORT}` },
    },
    {
      name: "prod",
      use: { baseURL: `http://localhost:${PROD_PORT}` },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter example-basic dev`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: false,
      timeout: 15000,
      env: { PORT: String(DEV_PORT) },
    },
    {
      command: `pnpm --filter example-basic build && pnpm --filter example-basic preview`,
      url: `http://localhost:${PROD_PORT}`,
      reuseExistingServer: false,
      timeout: 30000,
      env: { PORT: String(PROD_PORT) },
    },
  ],
});
