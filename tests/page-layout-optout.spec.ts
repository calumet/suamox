import { expect, test } from "@playwright/test";

test.describe("export const layout = false", () => {
  test("la pagina se renderiza sin la cadena de layouts", async ({ page }) => {
    await page.goto("/sin-layout");

    await expect(page.locator("h1")).toHaveText("Sin layout");
    await expect(page.getByTestId("sin-layout")).toBeVisible();
    await expect(page.locator("header")).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);
  });

  test("sus hermanas conservan el layout", async ({ page }) => {
    await page.goto("/time");

    await expect(page.locator("header")).toContainText("Suamox");
  });

  test("el router del cliente entra y sale del layout sin recargar", async ({ page }) => {
    await page.goto("/time");
    await expect(page.locator("header")).toContainText("Suamox");
    await page.evaluate(() => {
      // eslint-disable-next-line
      (window as any).__SPA_MARKER__ = true;
    });

    await page.click('nav a[href="/sin-layout"]');
    await expect(page.locator("h1")).toHaveText("Sin layout");
    await expect(page.locator("header")).toHaveCount(0);

    await page.click('a[href="/time"]');
    await expect(page.locator("h1")).toContainText("Server Time");
    await expect(page.locator("header")).toContainText("Suamox");

    const marker = await page.evaluate(() => {
      // eslint-disable-next-line
      return (window as any).__SPA_MARKER__;
    });
    expect(marker).toBe(true);
  });
});
