import { expect, test } from "@playwright/test";

const LAYOUT_MARKER = { selector: ".blog-layout-marker", color: "rgb(65, 43, 21)" };

// La pagina sin loader, la que si lo tiene -que pasa por el stripping, donde la
// poda de imports podria llevarse el CSS- y el layout que comparten: las tres
// claves de manifest que resuelve el SSG.
const ROUTES = [
  {
    path: "/blog",
    markers: [{ selector: ".blog-index-marker", color: "rgb(12, 34, 56)" }, LAYOUT_MARKER],
  },
  {
    path: "/blog/hello-world",
    markers: [{ selector: ".blog-post-marker", color: "rgb(90, 12, 120)" }, LAYOUT_MARKER],
  },
];

test.describe("CSS de pagina y layout en el HTML prerenderizado", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "prod", "prod only");
  });

  for (const { path, markers } of ROUTES) {
    test(`${path} enlaza las hojas de estilo generadas`, async ({ page, request }) => {
      const response = await page.goto(path);
      const html = await response!.text();

      const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]!);
      expect(hrefs.length).toBeGreaterThan(0);

      const sheets = await Promise.all(
        hrefs.map(async (href) => {
          const css = await request.get(href);
          expect(css.status()).toBe(200);
          return css.text();
        }),
      );
      const allCss = sheets.join("\n");

      for (const { selector } of markers) {
        expect(allCss).toContain(selector);
      }
    });
  }

  // Sin JS no hay hidratacion: si el estilo aplica, viene del HTML prerenderizado.
  test.describe("sin JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    for (const { path, markers } of ROUTES) {
      test(`${path} aplica los estilos sin hidratar`, async ({ page }) => {
        await page.goto(path);

        for (const { selector, color } of markers) {
          await expect(page.locator(selector)).toHaveCSS("color", color);
        }
      });
    }
  });
});
