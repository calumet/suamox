import { expect, test } from "@playwright/test";

// `/__data` omite los layouts que se salto en vez de mandarlos como `null`. Si
// mandara `null`, seria indistinguible de un loader que corrio y devolvio
// `null`, y el cliente rellenaria ese con los datos de la ruta anterior.
test.describe("un loader de layout que devuelve null", () => {
  test("no hereda los datos de la ruta anterior al navegar por SPA", async ({ page }) => {
    await page.goto("/es/correos");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Suamox Basic Example");

    // Cambia el param del layout, asi que su loader vuelve a correr — y esta vez
    // devuelve null
    await page.click('[data-testid="lang-sin-datos"]');

    await expect(page.getByTestId("lang-header")).toContainText("Info: sin datos");
    await expect(page.getByTestId("lang-footer")).toContainText("Footer: sin datos");
  });

  test("la carga completa y la navegacion SPA rinden lo mismo", async ({ page }) => {
    await page.goto("/sindatos/correos");
    await expect(page.getByTestId("lang-header")).toContainText("sin datos");
    const directo = await page.getByTestId("lang-header").textContent();

    await page.goto("/es/correos");
    await page.click('[data-testid="lang-sin-datos"]');
    // Hay que esperar a que la navegacion acabe: `textContent()` no reintenta,
    // asi que sin esto se lee el header de la ruta anterior
    await expect(page.getByTestId("lang-header")).toContainText("sin datos");
    const navegando = await page.getByTestId("lang-header").textContent();

    expect(navegando).toBe(directo);
  });

  test("un layout estable sigue sin volver a pedir su loader", async ({ page }) => {
    await page.goto("/es/noticias");

    // Mismo idioma: el param no cambia, asi que el layout viaja como estable y
    // su dato tiene que seguir llegando entero
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/__data")),
      page.click('a[href="/es/noticias/noticia?id=1"]'),
    ]);

    expect(decodeURIComponent(request.url())).toContain("layout:[lang]");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Suamox Basic Example");
  });
});
