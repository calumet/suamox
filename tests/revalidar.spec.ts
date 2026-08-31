import { expect, test } from "@playwright/test";

test.describe("revalidar()", () => {
  test("re-ejecuta los loaders de la ruta activa sin recargar la pagina", async ({ page }) => {
    await page.goto("/es/revalidar");
    await expect(page.locator("h1")).toHaveText("Revalidar");

    const before = await page.getByTestId("ticks").textContent();
    await page.evaluate(() => {
      // eslint-disable-next-line
      (window as any).__SPA_MARKER__ = true;
    });

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/__data")),
      page.getByTestId("revalidar").click(),
    ]);

    await expect(page.getByTestId("ticks")).not.toHaveText(before ?? "");

    // Los loaders de los layouts tambien se re-ejecutan: sin stableLayouts
    expect(decodeURIComponent(request.url())).not.toContain("stableLayouts=");
    await expect(page.getByTestId("lang-header")).toContainText("Info: Suamox Basic Example");

    const marker = await page.evaluate(() => {
      // eslint-disable-next-line
      return (window as any).__SPA_MARKER__;
    });
    expect(marker).toBe(true);
  });

  test("una revalidacion pedida antes de la hidratacion no se pierde", async ({ page }) => {
    const dataRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/__data")) {
        dataRequests.push(req.url());
      }
    });

    await page.goto("/es/revalidar?revalidar-temprano");
    await expect(page.locator("h1")).toHaveText("Revalidar");

    // Sin la revalidacion encolada esta pagina no pide datos: los trae el SSR
    await expect.poll(() => dataRequests.length).toBe(1);
  });
});
