import { expect, test } from "@playwright/test";

test.describe("blog SSG pages with loader and getStaticPaths", () => {
  test("renders blog post with loader data", async ({ page }) => {
    await page.goto("/blog/hello-world");

    await expect(page.locator("h1")).toContainText("Hello World");
    await expect(page.locator("time")).toContainText("2026-01-15");
    await expect(page.locator("article p")).toContainText("This is my first blog post!");
  });

  test("renders all static paths correctly", async ({ page }) => {
    for (const slug of ["hello-world", "react-ssr", "suamox-framework"]) {
      const response = await page.goto(`/blog/${slug}`);
      expect(response!.status()).toBe(200);
      await expect(page.locator("article")).toBeVisible();
    }
  });

  test("renders not found for invalid blog slug", async ({ page }) => {
    await page.goto("/blog/nonexistent-post");

    await expect(page.locator("h1")).toContainText("Post Not Found");
  });

  test("SSG pages do not include client hydration scripts", async ({ page }) => {
    const response = await page.goto("/blog/hello-world");
    const html = await response!.text();

    // SSG pages should not include __INITIAL_DATA__ or entry-client scripts
    expect(html).not.toContain("window.__INITIAL_DATA__");
  });

  test("blog layout wraps blog pages", async ({ page }) => {
    await page.goto("/blog/hello-world");

    // Root layout should be present
    await expect(page.locator("header").first()).toContainText("Suamox");
  });
});
