import { expect, test } from "@playwright/test";

// El de produccion lo cubre `route-css.spec.ts`, que es prod-only. En
// desarrollo el CSS no sale del manifest sino del grafo de modulos del entorno
// SSR, y hay que recorrer pagina y layouts por separado: un layout no cuelga
// del grafo de su pagina, los compone el runtime.
test.describe("CSS en desarrollo", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "dev", "dev only");
  });

  test("enlaza el global del layout raiz, el del layout de la seccion y el de la pagina", async ({
    page,
  }) => {
    const response = await page.goto("/blog");
    const html = await response!.text();
    const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]!);

    expect(hrefs).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/src/styles/global.css"),
        expect.stringContaining("/src/pages/blog/blog-layout.css"),
        expect.stringContaining("/src/pages/blog/blog.css"),
      ]),
    );
  });

  test("los estilos aplican de verdad, no solo estan enlazados", async ({ page }) => {
    await page.goto("/blog");

    await expect(page.locator(".blog-layout-marker")).toHaveCSS("color", "rgb(65, 43, 21)");
    await expect(page.locator(".blog-index-marker")).toHaveCSS("color", "rgb(12, 34, 56)");
  });

  test("una pagina sin CSS propio conserva el global", async ({ page }) => {
    const response = await page.goto("/counter");
    const html = await response!.text();

    expect(html).toContain("/src/styles/global.css");
  });
});
