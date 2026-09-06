import { expect, test } from "@playwright/test";

test.describe("useClientValue", () => {
  test("sin sesion el SSR ya sirve el estado por defecto", async ({ page }) => {
    await page.goto("/prehydrate");

    await expect(page.getByTestId("btn-login")).toBeVisible();
    await expect(page.getByTestId("btn-logout")).toBeHidden();
    await expect(page.getByTestId("estado-fuera")).toBeVisible();
    await expect(page.getByTestId("estado-dentro")).toBeHidden();
  });

  test("con sesion el script inline corrige el DOM antes de hidratar", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("idUsr", "42"));
    await page.goto("/prehydrate");

    await expect(page.getByTestId("btn-logout")).toBeVisible();
    await expect(page.getByTestId("btn-login")).toBeHidden();
    await expect(page.getByTestId("estado-dentro")).toBeVisible();
    await expect(page.getByTestId("estado-fuera")).toBeHidden();
  });

  test("el valor resuelto queda en __PREHYDRATE__ para que React lo lea", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("idUsr", "42"));
    await page.goto("/prehydrate");

    const valores = await page.evaluate(() =>
      Object.values((window as Record<string, unknown>).__PREHYDRATE__ ?? {}),
    );
    expect(valores).toContain(true);
  });

  test("no hay error de hidratacion al corregir el DOM", async ({ page }) => {
    const errores: string[] = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => {
      if (/hydrat|mismatch/i.test(m.text())) errores.push(m.text());
    });

    await page.addInitScript(() => sessionStorage.setItem("idUsr", "42"));
    await page.goto("/prehydrate");
    await page.waitForLoadState("networkidle");

    expect(errores).toEqual([]);
  });

  test("el estado sobrevive a una navegacion SPA de ida y vuelta", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("idUsr", "42"));
    await page.goto("/prehydrate");
    await expect(page.getByTestId("btn-logout")).toBeVisible();

    await page.goto("/time");
    await page.goBack();

    await expect(page.getByTestId("btn-logout")).toBeVisible();
    await expect(page.getByTestId("btn-login")).toBeHidden();
  });
});
