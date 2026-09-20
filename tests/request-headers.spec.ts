import { test, expect } from "@playwright/test";

// El loader devuelve los nombres de las cookies, no sus valores: lo que
// devuelve viaja al navegador dentro de `__INITIAL_DATA__`, y el valor de una
// cookie HttpOnly no tiene por que llegar ahi. Lo que se comprueba aqui es que
// la cabecera llego al loader, y para eso el nombre alcanza.
test.describe("request headers in loaders", () => {
  test("layout loader receives cookies from the browser", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "JSESSIONID",
        value: "abc123",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/es/noticias");

    await expect(page.getByTestId("cookie-names")).toContainText("JSESSIONID");
  });

  test("layout loader receives cookies during SPA navigation", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "session",
        value: "xyz789",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/es/noticias");
    await expect(page.getByTestId("cookie-names")).toContainText("session");

    // SPA navigate to a sibling page
    await page.click('a[href="/es/noticias/noticia?id=1"]');
    await expect(page.getByTestId("noticia-title")).toBeVisible();

    // Cookie should still be present after SPA navigation
    await expect(page.getByTestId("cookie-names")).toContainText("session");
  });

  test("page loader receives cookies via __data during SPA navigation", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "session",
        value: "test123",
        domain: "localhost",
        path: "/",
      },
    ]);

    // Initial SSR load
    await page.goto("/es/noticias");
    await expect(page.getByTestId("cookie-names")).toContainText("session");

    // SPA navigate to sibling, verify layout still shows cookie
    await page.click('a[href="/es/noticias/noticia?id=1"]');
    await expect(page.getByTestId("noticia-title")).toBeVisible();
    await expect(page.getByTestId("cookie-names")).toContainText("session");
  });

  test("el valor de la cookie no llega al navegador", async ({ page, context }) => {
    await context.addCookies([
      { name: "session", value: "no-debe-aparecer", domain: "localhost", path: "/" },
    ]);

    const response = await page.goto("/es/noticias");

    expect(await response!.text()).not.toContain("no-debe-aparecer");
    const datos = await page.evaluate(() =>
      JSON.stringify((window as unknown as { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__),
    );
    expect(datos).not.toContain("no-debe-aparecer");
  });
});
