import { expect, test } from "@playwright/test";

test.describe("SPA navigation", () => {
  test("navigates between pages without full reload", async ({ page }) => {
    await page.goto("/time");
    await expect(page.locator("h1")).toContainText("Server Time");

    // Click a link to navigate via SPA
    await page.click('a[href="/dashboard"]');
    await expect(page.locator("h1")).toContainText("Dashboard");

    // The layout should persist (SPA, no full reload)
    await expect(page.locator("header")).toContainText("Suamox");
  });

  test("fetches loader data from /__data during SPA navigation", async ({ page }) => {
    // Visit /time first to warm up module cache, then navigate away
    await page.goto("/time");
    await expect(page.locator("h1")).toContainText("Server Time");
    await page.click('a[href="/dashboard"]');
    await expect(page.locator("h1")).toContainText("Dashboard");

    // Navigate back to /time via SPA — module is cached, /__data should fire
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/__data")),
      page.click('a[href="/time"]'),
    ]);
    await expect(page.locator("h1")).toContainText("Server Time");
    expect(request.url()).toContain("/__data");
    expect(decodeURIComponent(request.url())).toContain("path=/time");
  });

  test("back navigation works after SPA navigation", async ({ page }) => {
    await page.goto("/time");
    await expect(page.getByTestId("time")).toBeVisible();

    // Navigate to another page
    await page.click('a[href="/dashboard"]');
    await expect(page.locator("h1")).toContainText("Dashboard");

    // Go back
    await page.goBack();
    await expect(page.locator("h1")).toContainText("Server Time");

    // Loader data should be present (re-fetched from /__data)
    await expect(page.getByTestId("time")).toBeVisible();
    await expect(page.getByTestId("time")).not.toBeEmpty();
  });

  test("back navigation from 404 page works", async ({ page }) => {
    await page.goto("/time");
    await expect(page.locator("h1")).toContainText("Server Time");

    // Navigate to a page that shows 404 content
    await page.goto("/this-does-not-exist");
    await expect(page.locator("h1")).toContainText("404");

    // Go back to the SSR page
    await page.goBack();
    await expect(page.locator("h1")).toContainText("Server Time");

    // Verify loader data is present and hooks work
    await expect(page.getByTestId("time")).toBeVisible();
    await expect(page.getByTestId("time")).not.toBeEmpty();
  });
});
