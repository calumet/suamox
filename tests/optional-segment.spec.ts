import { expect, test } from "@playwright/test";

test.describe("segmento opcional [[lang]]", () => {
  test("la ruta sin prefijo llega al loader sin el parametro", async ({ page }) => {
    await page.goto("/ingresar");

    await expect(page.locator("h1")).toHaveText("Ingresar");
    await expect(page.getByTestId("idioma")).toHaveText("es");
    await expect(page.getByTestId("prefijado")).toHaveText("false");
  });

  test("la ruta con prefijo recibe el parametro", async ({ page }) => {
    await page.goto("/en/ingresar");

    await expect(page.locator("h1")).toHaveText("Ingresar");
    await expect(page.getByTestId("idioma")).toHaveText("en");
    await expect(page.getByTestId("prefijado")).toHaveText("true");
  });

  test("el router del cliente navega entre las dos sin recargar", async ({ page }) => {
    await page.goto("/ingresar");
    await expect(page.getByTestId("idioma")).toHaveText("es");
    await page.evaluate(() => {
      // eslint-disable-next-line
      (window as any).__SPA_MARKER__ = true;
    });

    await page.click('a[href="/en/ingresar"]');
    await expect(page.getByTestId("idioma")).toHaveText("en");

    await page.click('a[href="/ingresar"]');
    await expect(page.getByTestId("idioma")).toHaveText("es");

    const marker = await page.evaluate(() => {
      // eslint-disable-next-line
      return (window as any).__SPA_MARKER__;
    });
    expect(marker).toBe(true);
  });
});
