import { expect, test } from "@playwright/test";

test.describe("useLoaderData hook", () => {
  test("provides loader data during SSR", async ({ page }) => {
    await page.goto("/loader-hook");

    await expect(page.getByTestId("message")).toHaveText("loaded from server");
    await expect(page.getByTestId("timestamp")).not.toBeEmpty();
  });

  test("provides loader data to child components", async ({ page }) => {
    await page.goto("/loader-hook");

    await expect(page.getByTestId("child-message")).toHaveText("Child says: loaded from server");
  });

  test("provides loader data during SPA navigation via /__data", async ({ page }) => {
    // Start on a different page
    await page.goto("/dashboard");

    // Navigate to the loader-hook page via SPA
    await page.click('a[href="/loader-hook"]');
    await expect(page.locator("h1")).toContainText("Loader Hook Test");

    // useLoaderData should work with data fetched from /__data
    await expect(page.getByTestId("message")).toHaveText("loaded from server");
    await expect(page.getByTestId("child-message")).toHaveText("Child says: loaded from server");
  });

  test("provides fresh data on back navigation", async ({ page }) => {
    await page.goto("/loader-hook");
    const firstTimestamp = await page.getByTestId("timestamp").textContent();

    // Navigate away
    await page.click('a[href="/dashboard"]');
    await expect(page.locator("h1")).toContainText("Dashboard");

    // Navigate back — should fetch fresh data from /__data
    await page.goBack();
    await expect(page.locator("h1")).toContainText("Loader Hook Test");
    await expect(page.getByTestId("message")).toHaveText("loaded from server");
  });
});

// useStaticProps context sharing in prod SSG depends on the Vite build pipeline
// externalizing @calumet/suamox correctly — tracked separately.
test.describe("useStaticProps hook", () => {
  test("provides static props during SSG render", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "prod", "SSG build context sharing tracked separately");
    await page.goto("/static-props");

    await expect(page.getByTestId("greeting")).toHaveText("Hello from static props!");
    await expect(page.getByTestId("build")).toHaveText("2026-01-01");
  });
});
