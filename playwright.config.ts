import { defineConfig } from "@playwright/test";

function resolvePort(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} tiene que ser un puerto entre 1 y 65535, no "${value}"`);
  }
  return port;
}

const DEV_PORT = resolvePort("E2E_DEV_PORT", 3000);
const PROD_PORT = resolvePort("E2E_PROD_PORT", 3001);

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
