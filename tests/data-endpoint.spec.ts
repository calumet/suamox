import { expect, test } from "@playwright/test";

test.describe("/__data endpoint", () => {
  test("returns loader data as JSON", async ({ request }) => {
    const response = await request.get("/__data?path=/time");

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty("time");
    expect(json).toHaveProperty("secret");
  });

  test("returns null for routes without loader", async ({ request }) => {
    const response = await request.get("/__data?path=/dashboard");

    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toBeNull();
  });

  test("returns 400 when path parameter is missing", async ({ request }) => {
    const response = await request.get("/__data");

    expect(response.status()).toBe(400);
  });

  test("executes loader on server with access to server-only values", async ({ request }) => {
    const response = await request.get("/__data?path=/time");
    const json = await response.json();

    // The loader reads process.env.TEST_SECRET which is only available on the server
    expect(json.secret).toBe("server-only");
  });
});
