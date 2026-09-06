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

  // El script parchea el DOM aunque React se quede con el fallback, asi que mirar
  // solo el DOM no distingue "funciona" de "roto". Esto pregunta a React.
  test("React hidrata con el valor real, no con el fallback", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("idUsr", "42"));
    await page.goto("/prehydrate");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("preguntar").click();
    await expect(page.getByTestId("respuesta")).toHaveText("true");
  });

  test("sin sesion React tambien tiene el valor correcto", async ({ page }) => {
    await page.goto("/prehydrate");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("preguntar").click();
    await expect(page.getByTestId("respuesta")).toHaveText("false");
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

  // Una navegacion SPA remonta el arbol. Con una clave derivada del codigo esto
  // fallaba en produccion, donde el minificador reescribe el cuerpo del resolve.
  test("el valor sobrevive a una navegacion SPA de ida y vuelta", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("idUsr", "42"));
    await page.goto("/prehydrate");
    await expect(page.getByTestId("btn-logout")).toBeVisible();

    await page.goto("/time");
    await page.goBack();
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("btn-logout")).toBeVisible();
    await expect(page.getByTestId("btn-login")).toBeHidden();

    await page.getByTestId("preguntar").click();
    await expect(page.getByTestId("respuesta")).toHaveText("true");
  });

  test("una ruta sin sesion y otra con sesion no se contaminan entre si", async ({ browser }) => {
    const limpio = await browser.newContext();
    const conSesion = await browser.newContext();
    await conSesion.addInitScript(() => sessionStorage.setItem("idUsr", "42"));

    const a = await limpio.newPage();
    const b = await conSesion.newPage();
    await a.goto("/prehydrate");
    await b.goto("/prehydrate");

    await expect(a.getByTestId("btn-login")).toBeVisible();
    await expect(b.getByTestId("btn-logout")).toBeVisible();

    await limpio.close();
    await conSesion.close();
  });
});
