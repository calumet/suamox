import { expect, test, type Page } from "@playwright/test";

const marcar = (page: Page) =>
  page.evaluate(() => {
    // oxlint-disable-next-line typescript/no-explicit-any
    (window as any).__SPA_MARKER__ = true;
  });

const marcador = (page: Page) =>
  page.evaluate(() => {
    // oxlint-disable-next-line typescript/no-explicit-any
    return (window as any).__SPA_MARKER__;
  });

const clicEnEnlace = (page: Page, href: string) =>
  page.evaluate((destino) => {
    const enlace = document.createElement("a");
    enlace.href = destino;
    enlace.textContent = "ir";
    document.body.append(enlace);
    enlace.click();
  }, href);

test.describe("navegacion completa", () => {
  test("un enlace sin ruta propia se lo pide al servidor", async ({ page }) => {
    await page.goto("/time");
    await expect(page.locator("h1")).toContainText("Server Time");
    await marcar(page);

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith("/legado/Buscador.jsp")),
      clicEnEnlace(page, "/legado/Buscador.jsp"),
    ]);

    // El 404 lo pinta el servidor, con su status
    expect(response.status()).toBe(404);
    await expect(page.locator("h1")).toContainText("404");
    expect(await marcador(page)).toBeUndefined();
  });

  test("si fallan los datos, la URL y la pantalla no se descuadran", async ({ page }) => {
    await page.goto("/time");
    await expect(page.locator("h1")).toContainText("Server Time");
    await marcar(page);

    // El documento lo pide la recarga, no el clic
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith("/loader-roto") && res.request().resourceType() === "document",
      ),
      clicEnEnlace(page, "/loader-roto"),
    ]);

    expect(response.status()).toBe(500);
    await expect(page).toHaveURL(/\/loader-roto$/);
    await expect(page.locator("h1")).toHaveText("500 - Algo falló");
    expect(await marcador(page)).toBeUndefined();
  });
});
