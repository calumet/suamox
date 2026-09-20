import { expect, test } from "@playwright/test";

test.describe("el manifest no sale por HTTP", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "prod", "prod only");
  });

  // Dentro del directorio servido, el manifest publica el mapa de cada fuente a
  // su archivo: el inventario de rutas, incluidas las que nadie enlaza.
  for (const path of [
    "/.vite/manifest.json",
    "/assets/../.vite/manifest.json",
    "/.env",
    "/.git/config",
  ]) {
    test(`${path} responde 404`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(404);
    });
  }

  test("una ruta normal sigue sirviendose", async ({ request }) => {
    const response = await request.get("/");

    expect(response.status()).toBe(200);
  });

  test("los assets del cliente siguen sirviendose", async ({ page, request }) => {
    // `/counter` y no `/`, que va prerenderizada y no lleva scripts de cliente
    const response = await page.goto("/counter");
    const html = await response!.text();
    const script = /<script type="module" src="([^"]+)">/.exec(html)?.[1];

    expect(script).toBeTruthy();
    expect((await request.get(script!)).status()).toBe(200);
  });
});
