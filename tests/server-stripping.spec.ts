import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, "../examples/basic/dist/client");

/**
 * Recursively reads all JS files in a directory and concatenates their contents.
 * This gives us the full client bundle to search for leaked server code.
 */
async function readAllClientJs(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  let content = "";

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      content += await readAllClientJs(fullPath);
    } else if (entry.name.endsWith(".js")) {
      content += await readFile(fullPath, "utf-8");
    }
  }

  return content;
}

test.describe("Server code stripping", () => {
  // These tests only make sense in the prod project (which runs build first)
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "prod", "prod only");
  });

  test("page renders correctly (server side works)", async ({ page }) => {
    await page.goto("/secret-test");

    await expect(page.getByTestId("secret-heading")).toHaveText("Secret Test");
    await expect(page.getByTestId("secret-message")).toHaveText("Data loaded securely");
  });

  test(".server.ts marker strings do NOT appear in client bundle", async () => {
    const clientJs = await readAllClientJs(CLIENT_DIST);

    // These strings are defined in secrets.server.ts
    expect(clientJs).not.toContain("MARKER_SERVER_SECRET_DB_CONN_12345");
    expect(clientJs).not.toContain("MARKER_SERVER_SECRET_API_KEY_67890");
    expect(clientJs).not.toContain("getServerOnlyData");
  });

  test("loader function body does NOT appear in client bundle", async () => {
    const clientJs = await readAllClientJs(CLIENT_DIST);

    // The loader imports getServerOnlyData - that import should be stripped
    expect(clientJs).not.toContain("secrets.server");

    // The loader calls getServerOnlyData() - this call should not exist in client JS
    expect(clientJs).not.toContain("getServerOnlyData");

    // process.env references from time.tsx loader should not be in client
    expect(clientJs).not.toContain("TEST_SECRET");
  });

  test("loader export name does NOT appear in client bundle route definitions", async () => {
    const clientJs = await readAllClientJs(CLIENT_DIST);

    // The codegen for client should not have `loader:` or `getStaticPaths:` in route objects
    // We search for patterns that would indicate the loader is still being assigned
    expect(clientJs).not.toMatch(/\.loader\s*=\s*_module\.loader/);
    expect(clientJs).not.toMatch(/loader:\s*_module\.loader/);
    expect(clientJs).not.toMatch(/getStaticPaths:\s*_module\.getStaticPaths/);
  });

  test("component default export DOES appear in client bundle", async () => {
    const clientJs = await readAllClientJs(CLIENT_DIST);

    // The page component should still exist
    expect(clientJs).toContain("Secret Test");
    expect(clientJs).toContain("secret-heading");
  });

  test("__INITIAL_DATA__ is available but loader function is not accessible via window", async ({
    page,
  }) => {
    await page.goto("/secret-test");

    // The data should be available (server rendered it)
    const initialData = await page.evaluate(() => {
      return (window as Record<string, unknown>).__INITIAL_DATA__;
    });
    expect(initialData).toEqual({
      message: "Data loaded securely",
      loadedAt: expect.any(Number),
    });

    // But the server secrets should NOT be in __INITIAL_DATA__
    const dataStr = JSON.stringify(initialData);
    expect(dataStr).not.toContain("MARKER_SERVER_SECRET_DB_CONN_12345");
    expect(dataStr).not.toContain("MARKER_SERVER_SECRET_API_KEY_67890");
  });

  test("cannot access loader function from client JS", async ({ page }) => {
    await page.goto("/secret-test");

    // Try to find any global reference to the loader
    const hasLoader = await page.evaluate(() => {
      // Check common places where a loader might accidentally leak
      const win = window as Record<string, unknown>;
      return (
        typeof win.loader === "function" ||
        typeof win.getServerOnlyData === "function" ||
        typeof win.DB_CONNECTION_STRING === "string" ||
        typeof win.API_KEY === "string"
      );
    });

    expect(hasLoader).toBe(false);
  });

  test("network responses do not leak server secrets", async ({ page }) => {
    // Monitor all network responses
    const responses: string[] = [];
    page.on("response", async (response) => {
      const url = response.url();
      if (url.endsWith(".js") || url.includes("__data")) {
        try {
          const body = await response.text();
          responses.push(body);
        } catch {
          // ignore
        }
      }
    });

    await page.goto("/secret-test");
    await page.waitForLoadState("networkidle");

    const allResponses = responses.join("\n");
    expect(allResponses).not.toContain("MARKER_SERVER_SECRET_DB_CONN_12345");
    expect(allResponses).not.toContain("MARKER_SERVER_SECRET_API_KEY_67890");
  });
});
