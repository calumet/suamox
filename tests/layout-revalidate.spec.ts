import { expect, test } from "@playwright/test";

// Un loader de layout puede depender de cosas que el router no ve desde el
// navegador —`locals`, cabeceras, la sesion—. `export const revalidate = true`
// es como el layout lo declara.
test.describe("export const revalidate = true", () => {
  test("el loader vuelve a correr aunque params y query no cambien", async ({ page }) => {
    await page.goto("/dashboard");
    const antes = await page.getByTestId("admin-sello").textContent();
    expect(antes).toBeTruthy();

    // Las dos paginas comparten `(admin)/layout.tsx`, sin params ni query de
    // por medio: sin la declaracion, el layout viajaria como estable
    await page.click('[data-testid="a-reportes"]');
    await expect(page.locator("h1")).toHaveText("Reportes");

    await expect(page.getByTestId("admin-sello")).not.toHaveText(antes!);
  });

  test("no viaja en stableLayouts", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/__data")),
      page.click('[data-testid="a-reportes"]'),
    ]);

    const url = decodeURIComponent(request.url());
    expect(url).not.toContain("layout:(admin)");
    // El resto de la cadena sigue aprovechandose
    expect(url).toContain("stableLayouts=");
  });
});
