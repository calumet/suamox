import { expect, test } from "@playwright/test";

test.describe("static routes take priority over dynamic routes", () => {
  test("/admin/correos matches static admin/correos.tsx, not [lang]/correos.tsx", async ({
    page,
  }) => {
    await page.goto("/admin/correos");

    await expect(page.getByTestId("admin-correos")).toHaveText("Admin Correos");
  });

  test("/admin/correos/ with trailing slash also matches static route", async ({ page }) => {
    await page.goto("/admin/correos/");

    await expect(page.getByTestId("admin-correos")).toHaveText("Admin Correos");
  });

  test("/es/correos still matches dynamic [lang]/correos.tsx", async ({ page }) => {
    await page.goto("/es/correos");

    await expect(page.getByTestId("lang-correos")).toHaveText("Correos es");
  });
});
