import { test, expect } from "@playwright/test";

test.describe("request headers in loaders", () => {
  test("layout loader receives cookies from the browser", async ({ page, context }) => {
    // Set a cookie before navigating
    await context.addCookies([
      {
        name: "JSESSIONID",
        value: "abc123",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/es/noticias");

    const cookieValue = page.getByTestId("cookie-value");
    await expect(cookieValue).toContainText("JSESSIONID=abc123");
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
    await expect(page.getByTestId("cookie-value")).toContainText("session=xyz789");

    // SPA navigate to a sibling page
    await page.click('a[href="/es/noticias/noticia?id=1"]');
    await expect(page.getByTestId("noticia-title")).toBeVisible();

    // Cookie should still be present after SPA navigation
    await expect(page.getByTestId("cookie-value")).toContainText("session=xyz789");
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
    await expect(page.getByTestId("cookie-value")).toContainText("session=test123");

    // SPA navigate to sibling, verify layout still shows cookie
    await page.click('a[href="/es/noticias/noticia?id=1"]');
    await expect(page.getByTestId("noticia-title")).toBeVisible();
    await expect(page.getByTestId("cookie-value")).toContainText("session=test123");
  });
});
