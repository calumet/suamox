import { expect, test } from "@playwright/test";

test.describe("SPA navigation", () => {
  test("navigates between pages without full reload", async ({ page }) => {
    await page.goto("/time");
    await expect(page.locator("h1")).toContainText("Server Time");

    // Set marker to detect full reload
    await page.evaluate(() => {
      // eslint-disable-next-line
      (window as any).__SPA_MARKER__ = true;
    });

    // Click nav link to navigate via SPA
    await page.click('nav a[href="/dashboard"]');
    await expect(page.locator("h1")).toContainText("Dashboard");

    // Marker should survive (SPA, no full reload)
    const marker = await page.evaluate(() => {
      // eslint-disable-next-line
      return (window as any).__SPA_MARKER__;
    });
    expect(marker).toBe(true);
    await expect(page.locator("header")).toContainText("Suamox");
  });

  test("fetches loader data from /__data during SPA navigation", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");

    const requestPromise = page.waitForRequest((req) => req.url().includes("/__data"));
    await page.click('nav a[href="/time"]');
    const request = await requestPromise;
    await expect(page.locator("h1")).toContainText("Server Time");
    expect(request.url()).toContain("/__data");
    expect(decodeURIComponent(request.url())).toContain("path=/time");
  });

  test("back navigation works after SPA navigation", async ({ page }) => {
    await page.goto("/time");
    await expect(page.getByTestId("time")).toBeVisible();

    await page.click('nav a[href="/counter"]');
    await expect(page.locator("h1")).toContainText("Counter");

    await page.goBack();
    await expect(page.locator("h1")).toContainText("Server Time");
    await expect(page.getByTestId("time")).toBeVisible();
    await expect(page.getByTestId("time")).not.toBeEmpty();
  });

  test("back navigation from 404 page works", async ({ page }) => {
    await page.goto("/time");
    await expect(page.locator("h1")).toContainText("Server Time");

    await page.goto("/this-does-not-exist");
    await expect(page.locator("h1")).toContainText("404");

    await page.goBack();
    await expect(page.locator("h1")).toContainText("Server Time");
    await expect(page.getByTestId("time")).toBeVisible();
    await expect(page.getByTestId("time")).not.toBeEmpty();
  });
});
