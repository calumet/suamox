import { expect, test } from "@playwright/test";

const langDe = (html: string): string | null =>
  /<html[^>]*\blang="([^"]*)"/.exec(html)?.[1] ?? null;

test.describe("html lang", () => {
  test("cada idioma declara el suyo, no el de la plantilla", async ({ request }) => {
    const es = await request.get("/es/correos");
    const en = await request.get("/en/correos");

    expect(langDe(await es.text())).toBe("es");
    expect(langDe(await en.text())).toBe("en");
  });

  test("una pagina que no lo declara se queda con el respaldo", async ({ request }) => {
    const response = await request.get("/counter");

    expect(langDe(await response.text())).toBe("en");
  });

  test("el atributo del documento llega al DOM, no solo al HTML", async ({ page }) => {
    await page.goto("/en/correos");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("al navegar dentro de la SPA el atributo se mueve", async ({ page }) => {
    await page.goto("/counter");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Marcador para probar que no hubo recarga: el documento no se vuelve a
    // pedir, asi que el atributo hay que moverlo a mano o se queda el viejo
    await page.evaluate(() => {
      (window as unknown as { __SIN_RECARGA__?: boolean }).__SIN_RECARGA__ = true;
    });

    await page.click('[data-testid="nav-es"]');
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    const sinRecarga = await page.evaluate(
      () => (window as unknown as { __SIN_RECARGA__?: boolean }).__SIN_RECARGA__,
    );
    expect(sinRecarga).toBe(true);
  });

  test("cambia al saltar de un idioma a otro, con el layout compartido", async ({ page }) => {
    await page.goto("/es/noticias");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    // Las dos rutas comparten `[lang]/layout.tsx`: el idioma sale de su loader,
    // asi que si el router lo da por estable el documento se queda en espanol
    await page.click('[data-testid="lang-en"]');

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
