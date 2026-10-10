import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, "../examples/basic/dist/client");

async function readAllClientJs(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  let content = "";
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      content += await readAllClientJs(fullPath);
    } else if (entry.name.endsWith(".js")) {
      content += await readFile(fullPath, "utf-8");
    }
  }
  return content;
}

test.describe("Acciones", () => {
  test("escribe en el servidor y la página ve el cambio al revalidar", async ({ page }) => {
    await page.goto("/acciones");
    const antes = Number(await page.getByTestId("notas").textContent());

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/__actions/")),
      page.getByTestId("agregar").click(),
    ]);

    await expect(page.getByTestId("resultado")).toHaveText(`total ${antes + 1}`);
    await expect(page.getByTestId("notas")).toHaveText(String(antes + 1));
    expect(request.method()).toBe("POST");
    expect(request.url()).toMatch(/\/__actions\/[0-9a-f]{16}$/);
  });

  test("un FormData llega como tal", async ({ page }) => {
    await page.goto("/acciones");
    await page.getByTestId("subir").click();
    await expect(page.getByTestId("resultado")).toHaveText("bytes 4");
  });

  test("un Response con error llega como ActionError con su estado y su cuerpo", async ({
    page,
  }) => {
    await page.goto("/acciones");
    await page.getByTestId("fallar").click();
    await expect(page.getByTestId("resultado")).toHaveText("422 NO_VALIDO");
  });

  test("una redirección llega como ActionError y no como éxito", async ({ page }) => {
    await page.goto("/acciones");
    await page.getByTestId("desviar").click();
    await expect(page.getByTestId("resultado")).toHaveText("302 /ingresar");
  });

  test("rechaza una petición de otro sitio", async ({ request }) => {
    const response = await request.post("/__actions/0123456789abcdef", {
      headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" },
      data: "[]",
    });
    expect(response.status()).toBe(403);
  });

  test("el código de la acción no llega al bundle del navegador", async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "prod", "prod only");

    const clientJs = await readAllClientJs(CLIENT_DIST);
    expect(clientJs).not.toContain("MARKER_ACTION_SERVER_ONLY_24680");
    expect(clientJs).not.toContain("guardarNota");
  });
});
