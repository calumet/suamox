import { expect, test } from "@playwright/test";

const BASE = "http://localhost:3000";

test.describe("API routes", () => {
  test("GET /api/health returns JSON with status ok", async ({ request }) => {
    const response = await request.get(`${BASE}/api/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  test("POST /api/session with sessionId sets cookie", async ({ request }) => {
    const response = await request.post(`${BASE}/api/session`, {
      data: "sessionId=abc",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const setCookie = response.headers()["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain("__session=abc");
  });

  test("DELETE /api/session clears the cookie", async ({ request }) => {
    const response = await request.delete(`${BASE}/api/session`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    const setCookie = response.headers()["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain("__session=;");
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970");
  });

  test("GET /api/session returns 405 Method Not Allowed", async ({ request }) => {
    const response = await request.get(`${BASE}/api/session`);
    expect(response.status()).toBe(405);
  });

  test("GET /api/nonexistent returns 404", async ({ request }) => {
    const response = await request.get(`${BASE}/api/nonexistent`);
    expect(response.status()).toBe(404);
  });

  test("GET /api/users/:id returns user with dynamic param", async ({ request }) => {
    const response = await request.get(`${BASE}/api/users/42`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("42");
    expect(body.name).toBe("User 42");
  });

  test("GET /api/users/:id with query params passes them through", async ({ request }) => {
    const response = await request.get(`${BASE}/api/users/7?format=xml`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("7");
    expect(body.format).toBe("xml");
  });

  test("PUT /api/users/:id receives JSON body", async ({ request }) => {
    const response = await request.put(`${BASE}/api/users/99`, {
      data: { name: "Updated User" },
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.id).toBe("99");
    expect(body.updated).toBe(true);
    expect(body.receivedName).toBe("Updated User");
  });

  test("POST /api/echo receives custom headers", async ({ request }) => {
    const response = await request.post(`${BASE}/api/echo`, {
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
        Cookie: "session=abc123",
      },
      data: "{}",
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.authorization).toBe("Bearer test-token");
    expect(body.contentType).toContain("application/json");
    expect(body.cookie).toContain("session=abc123");
  });

  test("DELETE /api/users/:id returns 405 when DELETE not exported", async ({ request }) => {
    const response = await request.delete(`${BASE}/api/users/1`);
    expect(response.status()).toBe(405);
  });
});
