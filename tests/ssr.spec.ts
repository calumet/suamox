import { expect, test } from "@playwright/test";

test.describe("SSR rendering", () => {
  test("renders SSR page with loader data from the server", async ({ page }) => {
    await page.goto("/time");

    const time = page.getByTestId("time");
    await expect(time).toBeVisible();
    await expect(time).not.toBeEmpty();
  });

  test("injects __INITIAL_DATA__ script for SSR pages", async ({ page }) => {
    const response = await page.goto("/time");
    const html = await response!.text();

    expect(html).toContain("window.__INITIAL_DATA__");
  });

  test("renders layout around SSR pages", async ({ page }) => {
    await page.goto("/time");

    await expect(page.locator("header")).toContainText("Suamox");
    await expect(page.locator("footer")).toContainText("Suamox example layout");
  });

  test("renders 404 page content for unmatched routes", async ({ page }) => {
    await page.goto("/this-does-not-exist");

    // The catch-all route handles all unmatched paths
    await expect(page.locator("h1")).toContainText("404");
  });
});
