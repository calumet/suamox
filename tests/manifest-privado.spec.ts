import { expect, test } from "@playwright/test";

test.describe("el manifest no sale por HTTP", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "prod", "prod only");
  });

  // Lo que importa es el contenido, no el codigo: el ejemplo tiene una ruta
  // catch-all, asi que un path inexistente responde 200 con su HTML igual.
  for (const path of ["/.vite/manifest.json", "/assets/../.vite/manifest.json"]) {
    test(`${path} no devuelve el manifest`, async ({ request }) => {
      const body = await (await request.get(path)).text();

      expect(body).not.toContain('"isEntry"');
      expect(body).not.toContain("src/pages/");
    });
  }

  // Empieza por punto y es legitimo: security.txt, los desafios ACME de Let's
  // Encrypt, apple-app-site-association. Filtrar dotfiles a ciegas lo rompe, y
  // Vite copia `public/` entero al output.
  test("lo que la app publica en .well-known si se sirve", async ({ request }) => {
    const response = await request.get("/.well-known/security.txt");

    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Contact:");
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
