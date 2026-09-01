import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { expandOptionalSegment, parseRoute, sortRoutes, validateRoutes } from "../src/parser";
import type { RouteRecord } from "../src/types";

describe("parseRoute", () => {
  const pagesDir = "/test/src/pages";

  it("should parse static route", () => {
    const filePath = join(pagesDir, "about.tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/about");
    expect(route.params).toEqual([]);
    expect(route.isCatchAll).toBe(false);
    expect(route.isIndex).toBe(false);
    expect(errors).toEqual([]);
  });

  it("should parse index route", () => {
    const filePath = join(pagesDir, "index.tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/");
    expect(route.params).toEqual([]);
    expect(route.isIndex).toBe(true);
    expect(errors).toEqual([]);
  });

  it("should parse nested index route", () => {
    const filePath = join(pagesDir, "blog", "index.tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/blog");
    expect(route.params).toEqual([]);
    expect(route.isIndex).toBe(true);
    expect(errors).toEqual([]);
  });

  it("should parse dynamic parameter route", () => {
    const filePath = join(pagesDir, "blog", "[slug].tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/blog/:slug");
    expect(route.params).toEqual(["slug"]);
    expect(route.isCatchAll).toBe(false);
    expect(errors).toEqual([]);
  });

  it("should parse multiple dynamic parameters", () => {
    const filePath = join(pagesDir, "users", "[id]", "posts", "[postId].tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/users/:id/posts/:postId");
    expect(route.params).toEqual(["id", "postId"]);
    expect(errors).toEqual([]);
  });

  it("should parse catch-all route", () => {
    const filePath = join(pagesDir, "[...all].tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/*");
    expect(route.params).toEqual(["all"]);
    expect(route.isCatchAll).toBe(true);
    expect(errors).toEqual([]);
  });

  it("should parse nested catch-all route", () => {
    const filePath = join(pagesDir, "docs", "[...path].tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/docs/*");
    expect(route.params).toEqual(["path"]);
    expect(route.isCatchAll).toBe(true);
    expect(errors).toEqual([]);
  });

  it("should handle route groups by removing them from path", () => {
    const filePath = join(pagesDir, "(admin)", "dashboard.tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/dashboard");
    expect(route.params).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("should handle nested route groups", () => {
    const filePath = join(pagesDir, "(auth)", "(protected)", "profile.tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/profile");
    expect(errors).toEqual([]);
  });

  it("should handle mixed static and dynamic segments", () => {
    const filePath = join(pagesDir, "users", "[id]", "edit.tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/users/:id/edit");
    expect(route.params).toEqual(["id"]);
    expect(errors).toEqual([]);
  });

  it("should handle .ts extension", () => {
    const filePath = join(pagesDir, "api", "users.ts");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/api/users");
    expect(errors).toEqual([]);
  });

  it("should parse optional segment", () => {
    const filePath = join(pagesDir, "[[lang]]", "ingresar.tsx");
    const { route, errors } = parseRoute(filePath, pagesDir);

    expect(route.path).toBe("/:lang/ingresar");
    expect(route.params).toEqual(["lang"]);
    expect(errors).toEqual([]);
  });

  it("should report error for two optional segments", () => {
    const filePath = join(pagesDir, "[[lang]]", "[[region]]", "ingresar.tsx");
    const { errors } = parseRoute(filePath, pagesDir);

    expect(errors[0]).toContain("Only one optional segment");
  });

  it("should report error when the optional segment is followed by a param", () => {
    const filePath = join(pagesDir, "[[lang]]", "[producto].tsx");
    const { errors } = parseRoute(filePath, pagesDir);

    expect(errors[0]).toContain("must be followed by a static segment");
  });

  it("should report error when the optional segment is followed by a catch-all", () => {
    const filePath = join(pagesDir, "[[lang]]", "[...resto].tsx");
    const { errors } = parseRoute(filePath, pagesDir);

    expect(errors[0]).toContain("must be followed by a static segment");
  });

  it("should report error for optional catch-all syntax", () => {
    const filePath = join(pagesDir, "[[...resto]].tsx");
    const { errors } = parseRoute(filePath, pagesDir);

    expect(errors[0]).toContain("Optional catch-all segment is not supported");
  });

  it("should report error for empty optional segment", () => {
    const filePath = join(pagesDir, "[[]]", "ingresar.tsx");
    const { errors } = parseRoute(filePath, pagesDir);

    expect(errors[0]).toContain("Invalid optional segment");
  });

  it("should report error for catch-all not at end", () => {
    const filePath = join(pagesDir, "[...all]", "invalid.tsx");
    const { errors } = parseRoute(filePath, pagesDir);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("must be the last segment");
  });

  it("should report error for invalid parameter syntax", () => {
    const filePath = join(pagesDir, "[].tsx");
    const { errors } = parseRoute(filePath, pagesDir);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Invalid parameter segment");
  });

  it("should report error for invalid catch-all syntax", () => {
    const filePath = join(pagesDir, "[...].tsx");
    const { errors } = parseRoute(filePath, pagesDir);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Invalid catch-all segment");
  });
});

describe("expandOptionalSegment", () => {
  const pagesDir = "/test/src/pages";

  const expand = (...parts: string[]) =>
    expandOptionalSegment(parseRoute(join(pagesDir, ...parts), pagesDir).route);

  it("should return the route untouched when there is no optional segment", () => {
    const routes = expand("blog", "[slug].tsx");

    expect(routes).toHaveLength(1);
    expect(routes[0]!.path).toBe("/blog/:slug");
  });

  it("should generate the route without the param and the one with it", () => {
    const routes = expand("[[lang]]", "ingresar.tsx");

    expect(routes.map((route) => route.path)).toEqual(["/ingresar", "/:lang/ingresar"]);
    expect(routes[0]!.params).toEqual([]);
    expect(routes[1]!.params).toEqual(["lang"]);
  });

  it("should generate the root path for an optional index", () => {
    const routes = expand("[[lang]]", "index.tsx");

    expect(routes.map((route) => route.path)).toEqual(["/", "/:lang"]);
  });

  it("should keep both routes pointing at the same file", () => {
    const routes = expand("[[lang]]", "ingresar.tsx");

    expect(routes[0]!.filePath).toBe(routes[1]!.filePath);
  });

  it("should give the route without the param a lower priority than a static sibling", () => {
    const [sinParam] = expand("[[lang]]", "index.tsx");
    const estatica = parseRoute(join(pagesDir, "ingresar.tsx"), pagesDir).route;
    const conParam = expand("[[lang]]", "index.tsx")[1]!;

    // /ingresar tiene que ganarle a /:lang o se resolveria como el idioma "ingresar"
    expect(estatica.priority).toBeGreaterThan(conParam.priority);
    expect(sinParam!.path).toBe("/");
  });
});

describe("sortRoutes", () => {
  it("should sort routes by priority (highest first)", () => {
    const routes: RouteRecord[] = [
      {
        path: "/",
        filePath: "/pages/index.tsx",
        params: [],
        isCatchAll: false,
        isIndex: true,
        segments: [],
        priority: 0,
      },
      {
        path: "/*",
        filePath: "/pages/[...all].tsx",
        params: ["all"],
        isCatchAll: true,
        isIndex: false,
        segments: [],
        priority: 101,
      },
      {
        path: "/blog/:slug",
        filePath: "/pages/blog/[slug].tsx",
        params: ["slug"],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 215,
      },
      {
        path: "/blog",
        filePath: "/pages/blog/index.tsx",
        params: [],
        isCatchAll: false,
        isIndex: true,
        segments: [],
        priority: 110,
      },
    ];

    const sorted = sortRoutes(routes);

    expect(sorted[0]?.path).toBe("/blog/:slug"); // priority 215
    expect(sorted[1]?.path).toBe("/blog"); // priority 110
    expect(sorted[2]?.path).toBe("/*"); // priority 101
    expect(sorted[3]?.path).toBe("/"); // priority 0
  });

  it("should sort alphabetically when priorities are equal", () => {
    const routes: RouteRecord[] = [
      {
        path: "/contact",
        filePath: "/pages/contact.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
      {
        path: "/about",
        filePath: "/pages/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const sorted = sortRoutes(routes);

    expect(sorted[0]?.path).toBe("/about");
    expect(sorted[1]?.path).toBe("/contact");
  });
});

describe("static vs dynamic priority", () => {
  const pagesDir = "/test/src/pages";

  it("should prioritize /admin over /:lang", () => {
    const { route: adminRoute } = parseRoute(join(pagesDir, "admin/index.tsx"), pagesDir);
    const { route: langRoute } = parseRoute(join(pagesDir, "[lang]/index.tsx"), pagesDir);
    const sorted = sortRoutes([langRoute, adminRoute]);

    expect(sorted[0]?.path).toBe("/admin");
    expect(sorted[1]?.path).toBe("/:lang");
  });

  it("should prioritize /admin/correos over /:lang/correos", () => {
    const { route: adminCorreos } = parseRoute(join(pagesDir, "admin/correos.tsx"), pagesDir);
    const { route: langCorreos } = parseRoute(join(pagesDir, "[lang]/correos.tsx"), pagesDir);
    const sorted = sortRoutes([langCorreos, adminCorreos]);

    expect(sorted[0]?.path).toBe("/admin/correos");
    expect(sorted[1]?.path).toBe("/:lang/correos");
  });
});

describe("validateRoutes", () => {
  it("should detect duplicate paths", () => {
    const routes: RouteRecord[] = [
      {
        path: "/about",
        filePath: "/pages/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
      {
        path: "/about",
        filePath: "/pages/(marketing)/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const errors = validateRoutes(routes);

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Duplicate route path");
    expect(errors[0]).toContain("/about");
  });

  it("should return no errors for valid routes", () => {
    const routes: RouteRecord[] = [
      {
        path: "/about",
        filePath: "/pages/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
      {
        path: "/contact",
        filePath: "/pages/contact.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const errors = validateRoutes(routes);

    expect(errors).toEqual([]);
  });
});
