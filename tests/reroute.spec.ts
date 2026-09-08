import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { expect, test } from "@playwright/test";

const SALIDA_SSG = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "examples",
  "basic",
  "dist",
  "static",
);

test.describe("reroute", () => {
  test("el alias sirve la pagina canonica en el servidor", async ({ page }) => {
    const response = await page.goto("/mx/counter");

    expect(response!.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Counter");
  });

  test("el alias de la raiz sirve la home", async ({ page }) => {
    await page.goto("/mx");

    await expect(page.locator("h1")).toHaveText("Welcome to Suamox");
  });

  test("el cliente casa la misma ruta al hidratar", async ({ page }) => {
    await page.goto("/mx/counter");

    const button = page.getByRole("button", { name: "Increment" });
    await expect(button).toBeEnabled();
    await button.click();

    await expect(page.locator("p")).toHaveText("Count: 1");
  });

  test("navegar a una URL con alias no recarga y trae los datos del loader", async ({ page }) => {
    await page.goto("/es/revalidar");
    await expect(page.getByTestId("ticks")).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __SPA__: boolean }).__SPA__ = true;
    });

    await page.evaluate(() => {
      const enlace = document.createElement("a");
      enlace.href = "/mx/es/revalidar";
      document.body.append(enlace);
      enlace.click();
    });

    await expect(page).toHaveURL(/\/mx\/es\/revalidar$/);
    await expect(page.getByTestId("ticks")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __SPA__?: boolean }).__SPA__)).toBe(
      true,
    );
  });

  test("una URL sin alias no se toca", async ({ page }) => {
    await page.goto("/counter");

    await expect(page.locator("h1")).toHaveText("Counter");
  });

  // El middleware ve la ruta rerouteada: si viera la pedida, el alias saltaria el guardia
  test("el guardia del middleware tambien corta la URL con alias", async ({ page }) => {
    await page.goto("/mx/protegido");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toHaveText("Welcome to Suamox");
  });

  test("el guardia tambien corta por el endpoint de datos", async ({ request }) => {
    const response = await request.get("/__data?path=/mx/protegido", {
      headers: { "sec-fetch-site": "same-origin" },
    });

    expect(await response.text()).toContain("__redirect");
  });

  test("las variantes del alias se prerenderizan", async ({ page }, testInfo) => {
    const response = await page.goto("/mx/blog/hello-world");

    expect(response!.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Hello World");

    // El 200 tambien lo daria el SSR dinamico, asi que en prod se comprueba el HTML en disco
    if (testInfo.project.name === "prod") {
      const html = await readFile(
        join(SALIDA_SSG, "mx", "blog", "hello-world", "index.html"),
        "utf-8",
      );
      expect(html).toContain("Hello World");
    }
  });
});
