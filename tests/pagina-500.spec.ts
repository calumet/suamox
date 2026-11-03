import { expect, test } from "@playwright/test";

test.describe("pagina 500", () => {
  test("un loader que falla pinta 500.tsx dentro del layout y la hidrata", async ({ page }) => {
    const errores: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errores.push(msg.text());
      }
    });

    const response = await page.goto("/loader-roto");

    expect(response?.status()).toBe(500);
    await expect(page.locator("h1")).toHaveText("500 - Algo falló");
    await expect(page.locator("header")).toContainText("Suamox");
    await expect(page).toHaveTitle("Suamox - Error");

    // Hidratada: el router navega sin recargar desde la pagina de error
    await page.evaluate(() => {
      // oxlint-disable-next-line typescript/no-explicit-any
      (window as any).__SPA_MARKER__ = true;
    });
    await page.click('nav a[href="/time"]');
    await expect(page.locator("h1")).toContainText("Server Time");
    const marker = await page.evaluate(() => {
      // oxlint-disable-next-line typescript/no-explicit-any
      return (window as any).__SPA_MARKER__;
    });
    expect(marker).toBe(true);
    expect(errores.filter((texto) => texto.includes("Hydration"))).toEqual([]);
  });
});
