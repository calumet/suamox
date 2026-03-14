import { describe, it, expect } from "vitest";

import { matchRoute, stripBase } from "../src/index";
import type { RouteRecord } from "../src/index";

function createMockRoute(overrides: Partial<RouteRecord>): RouteRecord {
  return {
    path: "/",
    filePath: "/pages/index.tsx",
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    component: (() => null) as any,
    layouts: [],
    params: [],
    isCatchAll: false,
    isIndex: true,
    priority: 0,
    ...overrides,
  };
}

describe("matchRoute", () => {
  describe("static routes", () => {
    it("should match exact static route", () => {
      const routes = [
        createMockRoute({ path: "/", priority: 0 }),
        createMockRoute({ path: "/about", priority: 110 }),
      ];

      const match = matchRoute(routes, "/about");

      expect(match).toBeTruthy();
      expect(match?.route.path).toBe("/about");
      expect(match?.params).toEqual({});
    });

    it("should match root route", () => {
      const routes = [createMockRoute({ path: "/" })];

      const match = matchRoute(routes, "/");

      expect(match).toBeTruthy();
      expect(match?.route.path).toBe("/");
      expect(match?.params).toEqual({});
    });

    it("should match nested static routes", () => {
      const routes = [createMockRoute({ path: "/blog/posts", priority: 220 })];

      const match = matchRoute(routes, "/blog/posts");

      expect(match).toBeTruthy();
      expect(match?.route.path).toBe("/blog/posts");
      expect(match?.params).toEqual({});
    });

    it("should return null for non-matching route", () => {
      const routes = [createMockRoute({ path: "/about" })];

      const match = matchRoute(routes, "/contact");

      expect(match).toBeNull();
    });

    it("should normalize empty pathname to /", () => {
      const routes = [createMockRoute({ path: "/" })];

      const match = matchRoute(routes, "");

      expect(match).toBeTruthy();
      expect(match?.route.path).toBe("/");
    });
  });

  describe("dynamic routes", () => {
    it("should match single parameter route", () => {
      const routes = [createMockRoute({ path: "/blog/:slug", params: ["slug"], priority: 215 })];

      const match = matchRoute(routes, "/blog/hello-world");

      expect(match).toBeTruthy();
      expect(match?.route.path).toBe("/blog/:slug");
      expect(match?.params).toEqual({ slug: "hello-world" });
    });

    it("should match multiple parameter route", () => {
      const routes = [
        createMockRoute({
          path: "/users/:userId/posts/:postId",
          params: ["userId", "postId"],
          priority: 430,
        }),
      ];

      const match = matchRoute(routes, "/users/123/posts/456");

      expect(match).toBeTruthy();
      expect(match?.params).toEqual({ userId: "123", postId: "456" });
    });

    it("should match parameter with special characters", () => {
      const routes = [createMockRoute({ path: "/blog/:slug", params: ["slug"] })];

      const match = matchRoute(routes, "/blog/hello-world-123");

      expect(match).toBeTruthy();
      expect(match?.params).toEqual({ slug: "hello-world-123" });
    });

    it("should not match if segment count differs", () => {
      const routes = [createMockRoute({ path: "/blog/:slug", params: ["slug"] })];

      const match = matchRoute(routes, "/blog/hello/world");

      expect(match).toBeNull();
    });
  });

  describe("catch-all routes", () => {
    it("should match catch-all route at root", () => {
      const routes = [
        createMockRoute({ path: "/*", isCatchAll: true, params: ["all"], priority: 101 }),
      ];

      const match = matchRoute(routes, "/any/path/here");

      expect(match).toBeTruthy();
      expect(match?.route.path).toBe("/*");
      expect(match?.params).toEqual({ all: "any/path/here" });
    });

    it("should match catch-all with base path", () => {
      const routes = [
        createMockRoute({ path: "/docs/*", isCatchAll: true, params: ["path"], priority: 201 }),
      ];

      const match = matchRoute(routes, "/docs/getting-started/intro");

      expect(match).toBeTruthy();
      expect(match?.params).toEqual({ path: "getting-started/intro" });
    });

    it("should match catch-all with empty remaining path", () => {
      const routes = [
        createMockRoute({ path: "/docs/*", isCatchAll: true, params: ["path"], priority: 201 }),
      ];

      const match = matchRoute(routes, "/docs/");

      expect(match).toBeTruthy();
      expect(match?.params).toEqual({ path: "" });
    });

    it("should not match catch-all if base path does not match", () => {
      const routes = [
        createMockRoute({ path: "/docs/*", isCatchAll: true, params: ["path"], priority: 201 }),
      ];

      const match = matchRoute(routes, "/blog/post");

      expect(match).toBeNull();
    });

    it("should extract dynamic params in catch-all base path", () => {
      const routes = [
        createMockRoute({
          path: "/:lang/contenido/*",
          isCatchAll: true,
          params: ["lang", "slug"],
          priority: 201,
        }),
      ];

      const match = matchRoute(routes, "/es/contenido/guias/inicio");

      expect(match).toBeTruthy();
      expect(match?.params).toEqual({ lang: "es", slug: "guias/inicio" });
    });

    it("should extract dynamic params in catch-all with single segment remainder", () => {
      const routes = [
        createMockRoute({
          path: "/:lang/contenido/*",
          isCatchAll: true,
          params: ["lang", "slug"],
          priority: 201,
        }),
      ];

      const match = matchRoute(routes, "/en/contenido/about");

      expect(match).toBeTruthy();
      expect(match?.params).toEqual({ lang: "en", slug: "about" });
    });
  });

  describe("route priority", () => {
    it("should match first route in order", () => {
      const routes = [
        createMockRoute({ path: "/blog/:slug", params: ["slug"], priority: 215 }),
        createMockRoute({ path: "/blog/special", priority: 220 }),
      ];

      const match = matchRoute(routes, "/blog/special");

      expect(match).toBeTruthy();
      expect(match?.route.path).toBe("/blog/:slug");
    });

    it("should prefer static over dynamic if ordered first", () => {
      const routes = [
        createMockRoute({ path: "/about", priority: 110 }),
        createMockRoute({ path: "/:page", params: ["page"], priority: 105 }),
      ];

      const match = matchRoute(routes, "/about");

      expect(match).toBeTruthy();
      expect(match?.route.path).toBe("/about");
      expect(match?.params).toEqual({});
    });
  });

  describe("edge cases", () => {
    it("should return null for empty routes array", () => {
      const routes: RouteRecord[] = [];

      const match = matchRoute(routes, "/any-path");

      expect(match).toBeNull();
    });

    it("should handle trailing slashes", () => {
      const routes = [createMockRoute({ path: "/about", priority: 110 })];

      const match1 = matchRoute(routes, "/about/");
      const match2 = matchRoute(routes, "/about");

      expect(match1).toBeNull();
      expect(match2).toBeTruthy();
    });

    it("should handle routes with multiple segments", () => {
      const routes = [
        createMockRoute({ path: "/api/users/:id/posts/:postId", params: ["id", "postId"] }),
      ];

      const match = matchRoute(routes, "/api/users/123/posts/456");

      expect(match).toBeTruthy();
      expect(match?.params).toEqual({ id: "123", postId: "456" });
    });
  });
});

describe("stripBase", () => {
  it("should return pathname unchanged when base is /", () => {
    expect(stripBase("/about", "/")).toBe("/about");
  });

  it("should return pathname unchanged when base is empty", () => {
    expect(stripBase("/about", "")).toBe("/about");
  });

  it("should strip base prefix from pathname", () => {
    expect(stripBase("/app/about", "/app")).toBe("/about");
  });

  it("should return / when pathname equals base", () => {
    expect(stripBase("/app", "/app")).toBe("/");
  });

  it("should strip nested base prefix", () => {
    expect(stripBase("/my/app/blog/post", "/my/app")).toBe("/blog/post");
  });

  it("should return pathname unchanged when base does not match", () => {
    expect(stripBase("/other/path", "/app")).toBe("/other/path");
  });

  it("should handle root pathname with base", () => {
    expect(stripBase("/app/", "/app")).toBe("/");
  });
});
