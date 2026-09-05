import { deserializeData } from "@calumet/suamox";
import { expect, test } from "@playwright/test";

test.describe("/__data endpoint", () => {
  test("returns loader data as JSON", async ({ request }) => {
    const response = await request.get("/__data?path=/time");

    expect(response.status()).toBe(200);
    const { page } = deserializeData(await response.json()) as { page: unknown };
    expect(page).toHaveProperty("time");
    expect(page).toHaveProperty("secret");
  });

  test("returns null for routes without loader", async ({ request }) => {
    const response = await request.get("/__data?path=/dashboard");

    expect(response.status()).toBe(200);
    const { page } = deserializeData(await response.json()) as { page: unknown };
    expect(page).toBeNull();
  });

  test("carries the root loader data next to the page data", async ({ request }) => {
    const response = await request.get("/__data?path=/sin-layout");

    expect(response.status()).toBe(200);
    const { layouts } = deserializeData(await response.json()) as {
      layouts: Record<string, unknown>;
    };
    expect(layouts.root).toEqual({ idioma: "es" });
  });

  test("returns 400 when path parameter is missing", async ({ request }) => {
    const response = await request.get("/__data");

    expect(response.status()).toBe(400);
  });

  test("returns the __redirect envelope when the loader redirects", async ({ request }) => {
    const response = await request.get("/__data?path=/redirigeme", { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expect(deserializeData(await response.json())).toEqual({
      __redirect: "/time",
      __status: 302,
    });
  });

  test("returns 302 on the SSR path when the loader redirects", async ({ request }) => {
    const response = await request.get("/redirigeme", { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe("/time");
  });

  test("the router follows an internal redirect without a full reload", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
    await page.evaluate(() => {
      // eslint-disable-next-line
      (window as any).__SPA_MARKER__ = true;
    });

    await page.click('a[href="/redirigeme"]');

    await expect(page.locator("h1")).toContainText("Server Time");
    expect(new URL(page.url()).pathname).toBe("/time");

    const marker = await page.evaluate(() => {
      // eslint-disable-next-line
      return (window as any).__SPA_MARKER__;
    });
    expect(marker).toBe(true);

    // La URL que redirige no queda en el historial
    await page.goBack();
    expect(new URL(page.url()).pathname).toBe("/dashboard");
  });

  test("the middleware guard also cuts off requests to /__data", async ({ request }) => {
    const data = await request.get("/__data?path=/protegido", { maxRedirects: 0 });
    expect(data.status()).toBe(200);
    expect(deserializeData(await data.json())).toEqual({ __redirect: "/", __status: 302 });

    const ssr = await request.get("/protegido", { maxRedirects: 0 });
    expect(ssr.status()).toBe(302);
    expect(ssr.headers().location).toBe("/");
  });

  test("executes loader on server with access to server-only values", async ({ request }) => {
    const response = await request.get("/__data?path=/time");
    const { page } = deserializeData(await response.json()) as { page: { secret: string } };

    // The loader reads process.env.TEST_SECRET which is only available on the server
    expect(page.secret).toBe("server-only");
  });
});
