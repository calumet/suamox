import { expect, test } from "@playwright/test";

test.describe("useLoaderData in layout during client-side navigation", () => {
  test("layout reads loader data on initial SSR load", async ({ page }) => {
    await page.goto("/es/noticias");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Site Info");
    await expect(page.getByTestId("lang-footer")).toContainText("Footer: Site Footer");
    await expect(page.locator("h1")).toHaveText("Noticias");
    await expect(page.getByTestId("noticias-list")).toBeVisible();
  });

  test("layout useLoaderData works after SPA navigation to sibling page", async ({ page }) => {
    await page.goto("/es/noticias");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Site Info");
    await expect(page.locator("h1")).toHaveText("Noticias");

    // SPA navigate to noticia with query param — this is the crash scenario
    await page.click('a[href="/es/noticias/noticia?id=1"]');
    await expect(page.getByTestId("noticia-title")).toHaveText("Noticia 1");
    await expect(page.getByTestId("noticia-id")).toHaveText("ID: 1");

    // Layout components must still have loader data
    await expect(page.getByTestId("lang-header")).toContainText("Info: Site Info");
    await expect(page.getByTestId("lang-footer")).toContainText("Footer: Site Footer");
  });

  test("layout useLoaderData works navigating between sibling pages", async ({ page }) => {
    await page.goto("/es/noticias");
    await expect(page.locator("h1")).toHaveText("Noticias");

    // Navigate to noticia 1
    await page.click('a[href="/es/noticias/noticia?id=1"]');
    await expect(page.getByTestId("noticia-title")).toHaveText("Noticia 1");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Site Info");

    // Navigate to noticia 2
    await page.click('a[href="/es/noticias/noticia?id=2"]');
    await expect(page.getByTestId("noticia-title")).toHaveText("Noticia 2");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Site Info");
    await expect(page.getByTestId("lang-footer")).toContainText("Footer: Site Footer");
  });

  test("layout useLoaderData works navigating back to list", async ({ page }) => {
    await page.goto("/es/noticias");
    await expect(page.locator("h1")).toHaveText("Noticias");

    await page.click('a[href="/es/noticias/noticia?id=1"]');
    await expect(page.getByTestId("noticia-title")).toHaveText("Noticia 1");

    // Navigate back to list
    await page.click('a[href="/es/noticias"]');
    await expect(page.locator("h1")).toHaveText("Noticias");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Site Info");
    await expect(page.getByTestId("lang-footer")).toContainText("Footer: Site Footer");
  });

  test("layout useLoaderData works with browser back button", async ({ page }) => {
    await page.goto("/es/noticias");
    await expect(page.locator("h1")).toHaveText("Noticias");

    await page.click('a[href="/es/noticias/noticia?id=1"]');
    await expect(page.getByTestId("noticia-title")).toHaveText("Noticia 1");

    await page.goBack();
    await expect(page.locator("h1")).toHaveText("Noticias");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Site Info");
    await expect(page.getByTestId("lang-footer")).toContainText("Footer: Site Footer");
  });
});
