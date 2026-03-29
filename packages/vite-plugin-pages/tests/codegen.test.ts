import { parse } from "acorn";
import { describe, it, expect } from "vitest";

import { generateClientProxy, generateRoutesModule } from "../src/codegen";
import type { ApiRouteRecord, RouteRecord } from "../src/types";

function assertValidModule(code: string): void {
  parse(code, { ecmaVersion: "latest", sourceType: "module" });
}

describe("generateRoutesModule", () => {
  it("should generate empty routes array for no routes", () => {
    const routes: RouteRecord[] = [];
    const code = generateRoutesModule(routes);

    expect(code).toContain("export const routes = [");
    expect(code).toContain("];");
    expect(code).toContain("export default routes;");
  });

  it("should generate route loaders for single route", () => {
    const routes: RouteRecord[] = [
      {
        path: "/about",
        filePath: "/project/src/pages/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain(
      `const loadPage0 = () => import("/project/src/pages/about.tsx?__suamox-client-route");`,
    );
    expect(code).toContain("const loadRoute0 = async () => {");
    expect(code).toContain('path: "/about"');
    expect(code).toContain("load: loadRoute0");
    // Client target should NOT include server-only fields
    expect(code).not.toContain("getStaticPaths: _module.getStaticPaths");
    expect(code).not.toContain("loader: _module.loader");
    expect(code).toContain("const _hasPrerender = 'prerender' in _module;");
    expect(code).toContain(
      "const _prerender = _hasPrerender ? _module.prerender === true : false;",
    );
    expect(code).toContain("const _hasCsr = 'csr' in _module;");
    expect(code).toContain("const _csr = _hasCsr ? _module.csr === true : false;");
    expect(code).toContain("params: []");
    expect(code).toContain("isCatchAll: false");
    expect(code).toContain("isIndex: false");
    expect(code).toContain("priority: 110");
  });

  it("should include server-only fields when target is server", () => {
    const routes: RouteRecord[] = [
      {
        path: "/about",
        filePath: "/project/src/pages/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
        hasLoader: true,
      },
    ];

    const code = generateRoutesModule(routes, { target: "server" });

    expect(code).toContain("getStaticPaths: _module.getStaticPaths");
    expect(code).toContain("loader: _module.loader");
    expect(code).toContain("hasLoader: true");
  });

  it("should generate multiple imports for multiple routes", () => {
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
        path: "/about",
        filePath: "/pages/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain("const loadPage0 = () => import");
    expect(code).toContain("const loadPage1 = () => import");
    expect(code).toContain("/pages/index.tsx");
    expect(code).toContain("/pages/about.tsx");
  });

  it("should handle dynamic routes with params", () => {
    const routes: RouteRecord[] = [
      {
        path: "/blog/:slug",
        filePath: "/pages/blog/[slug].tsx",
        params: ["slug"],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 215,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain('path: "/blog/:slug"');
    // Client target should NOT include server-only fields
    expect(code).not.toContain("getStaticPaths: _module.getStaticPaths");
    expect(code).toContain(
      "const _prerender = _hasPrerender ? _module.prerender === true : false;",
    );
    expect(code).toContain('params: ["slug"]');
  });

  it("should handle catch-all routes", () => {
    const routes: RouteRecord[] = [
      {
        path: "/*",
        filePath: "/pages/[...all].tsx",
        params: ["all"],
        isCatchAll: true,
        isIndex: false,
        segments: [],
        priority: 101,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain('path: "/*"');
    expect(code).toContain('params: ["all"]');
    expect(code).toContain("isCatchAll: true");
  });

  it("should include getStaticPaths and prerender in server target", () => {
    const routes: RouteRecord[] = [
      {
        path: "/blog/:slug",
        filePath: "/pages/blog/[slug].tsx",
        params: ["slug"],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 215,
      },
    ];

    const code = generateRoutesModule(routes, { target: "server" });

    expect(code).toContain("getStaticPaths: _module.getStaticPaths");
    expect(code).toContain(
      "const _prerender = _hasPrerender ? _module.prerender === true : false;",
    );
  });

  it("should include layouts when provided", () => {
    const routes: RouteRecord[] = [
      {
        path: "/blog/:slug",
        filePath: "/pages/blog/[slug].tsx",
        params: ["slug"],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 215,
        layouts: ["/pages/layout.tsx", "/pages/blog/layout.tsx"],
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain(
      `const loadLayout0_0 = () => import("/pages/layout.tsx?__suamox-client-route");`,
    );
    expect(code).toContain(
      `const loadLayout0_1 = () => import("/pages/blog/layout.tsx?__suamox-client-route");`,
    );
    expect(code).toContain("Promise.all([loadLayout0_0(), loadLayout0_1()])");
    expect(code).toContain("layouts: _layoutModules.map((mod) => mod.default)");
  });

  it("should normalize Windows paths to forward slashes", () => {
    const routes: RouteRecord[] = [
      {
        path: "/about",
        filePath: "/home/user/project/src/pages/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain(
      `const loadPage0 = () => import("/home/user/project/src/pages/about.tsx?__suamox-client-route");`,
    );
  });

  it("should generate valid JavaScript structure", () => {
    const routes: RouteRecord[] = [
      {
        path: "/blog/:id",
        filePath: "/pages/blog/[id].tsx",
        params: ["id"],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 215,
      },
    ];

    const code = generateRoutesModule(routes);

    // Should contain all expected exports
    expect(code).toContain("export const routes");
    expect(code).toContain("export default routes");

    // Should have valid route structure
    expect(code).toContain("path:");
    expect(code).toContain("load:");
    expect(code).toContain("filePath:");
  });

  it("should maintain route order", () => {
    const routes: RouteRecord[] = [
      {
        path: "/a",
        filePath: "/pages/a.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
      {
        path: "/b",
        filePath: "/pages/b.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
      {
        path: "/c",
        filePath: "/pages/c.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes);

    const aIndex = code.indexOf('path: "/a"');
    const bIndex = code.indexOf('path: "/b"');
    const cIndex = code.indexOf('path: "/c"');

    expect(aIndex).toBeLessThan(bIndex);
    expect(bIndex).toBeLessThan(cIndex);
  });

  it("should default to SSG when defaultMode is ssg", () => {
    const routes: RouteRecord[] = [
      {
        path: "/ssg",
        filePath: "/pages/ssg.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes, { defaultMode: "ssg" });

    expect(code).toContain("const _prerender = _hasPrerender ? _module.prerender === true : true;");
    expect(code).toContain("const _csr = _hasCsr ? _module.csr === true : false;");
  });

  it("should default to CSR when defaultMode is csr", () => {
    const routes: RouteRecord[] = [
      {
        path: "/csr",
        filePath: "/pages/csr.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes, { defaultMode: "csr" });

    expect(code).toContain(
      "const _prerender = _hasPrerender ? _module.prerender === true : false;",
    );
    expect(code).toContain("const _csr = _hasCsr ? _module.csr === true : !_prerender;");
  });

  it("should export base as / by default", () => {
    const code = generateRoutesModule([]);

    expect(code).toContain('export const base = "/";');
  });

  it("should export base with custom value", () => {
    const code = generateRoutesModule([], { base: "/app" });

    expect(code).toContain('export const base = "/app";');
  });

  it("should strip trailing slashes from base", () => {
    const code = generateRoutesModule([], { base: "/app/" });

    expect(code).toContain('export const base = "/app";');
  });

  it("should emit hasLoader flag on route object when route has loader", () => {
    const routes: RouteRecord[] = [
      {
        path: "/about",
        filePath: "/pages/about.tsx",
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
        hasLoader: true,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain("hasLoader: true");
  });

  it("should not emit hasLoader flag when route has no loader", () => {
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
    ];

    const code = generateRoutesModule(routes);

    expect(code).not.toContain("hasLoader");
  });

  it("should normalize base with multiple trailing slashes", () => {
    const code = generateRoutesModule([], { base: "/app///" });

    expect(code).toContain('export const base = "/app";');
  });

  it("should generate syntactically valid JavaScript for all targets", () => {
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
        path: "/blog/:slug",
        filePath: "/pages/blog/[slug].tsx",
        params: ["slug"],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 215,
        hasLoader: true,
        layouts: ["/pages/layout.tsx"],
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
    ];

    for (const target of ["client", "server"] as const) {
      const code = generateRoutesModule(routes, { target });
      expect(() => assertValidModule(code), `invalid JS for target="${target}"`).not.toThrow();
    }
  });

  it("should generate layoutInfos with routeIds for server target", () => {
    const routes: RouteRecord[] = [
      {
        path: "/:lang",
        filePath: "/pages/[lang]/index.tsx",
        params: ["lang"],
        isCatchAll: false,
        isIndex: true,
        segments: [],
        priority: 215,
        layouts: ["/pages/layout.tsx", "/pages/[lang]/layout.tsx"],
        layoutMetas: [
          { filePath: "/pages/layout.tsx", routeId: "layout:root", hasLoader: false },
          { filePath: "/pages/[lang]/layout.tsx", routeId: "layout:[lang]", hasLoader: true },
        ],
      },
    ];

    const code = generateRoutesModule(routes, { target: "server" });

    expect(code).toContain("layoutInfos:");
    expect(code).toContain("loader: mod.loader");
    expect(code).toContain('"layout:root"');
    expect(code).toContain('"layout:[lang]"');
  });

  it("should generate layoutInfos without loader for client target", () => {
    const routes: RouteRecord[] = [
      {
        path: "/:lang",
        filePath: "/pages/[lang]/index.tsx",
        params: ["lang"],
        isCatchAll: false,
        isIndex: true,
        segments: [],
        priority: 215,
        layouts: ["/pages/layout.tsx", "/pages/[lang]/layout.tsx"],
        layoutMetas: [
          { filePath: "/pages/layout.tsx", routeId: "layout:root", hasLoader: false },
          { filePath: "/pages/[lang]/layout.tsx", routeId: "layout:[lang]", hasLoader: true },
        ],
      },
    ];

    const code = generateRoutesModule(routes, { target: "client" });

    expect(code).toContain("layoutInfos:");
    expect(code).toContain('"layout:root"');
    expect(code).not.toContain("loader: mod.loader");
  });

  it("should emit hasLayoutLoaders and layoutRouteIds on route object", () => {
    const routes: RouteRecord[] = [
      {
        path: "/:lang",
        filePath: "/pages/[lang]/index.tsx",
        params: ["lang"],
        isCatchAll: false,
        isIndex: true,
        segments: [],
        priority: 215,
        layoutMetas: [
          { filePath: "/pages/layout.tsx", routeId: "layout:root", hasLoader: false },
          { filePath: "/pages/[lang]/layout.tsx", routeId: "layout:[lang]", hasLoader: true },
        ],
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain("hasLayoutLoaders: true");
    expect(code).toContain('layoutRouteIds: ["layout:root","layout:[lang]"]');
  });

  it("exports onRequest from middleware in server target only", () => {
    const routes: RouteRecord[] = [];
    const mwPath = "/project/src/middleware.ts";

    const serverCode = generateRoutesModule(routes, {
      target: "server",
      hasMiddleware: true,
      middlewarePath: mwPath,
    });
    const clientCode = generateRoutesModule(routes, {
      target: "client",
      hasMiddleware: true,
      middlewarePath: mwPath,
    });

    expect(serverCode).toContain(`export { onRequest } from "${mwPath}"`);
    expect(clientCode).not.toContain("onRequest");
    expect(clientCode).not.toContain("middleware");
  });

  it("does not export onRequest when hasMiddleware is false", () => {
    const routes: RouteRecord[] = [];

    const code = generateRoutesModule(routes, {
      target: "server",
      hasMiddleware: false,
    });

    expect(code).not.toContain("onRequest");
    expect(code).not.toContain("middleware");
  });
});

describe("API routes codegen", () => {
  it("does NOT include apiRoutes in client target", () => {
    const apiRoutes: ApiRouteRecord[] = [
      {
        path: "/api/users",
        filePath: "/project/src/api/users.ts",
        type: "api",
        httpMethods: ["GET", "POST"],
        params: [],
        isCatchAll: false,
        isIndex: false,
        priority: 110,
      },
    ];

    const code = generateRoutesModule([], { target: "client", apiRoutes });

    expect(code).not.toContain("apiRoutes");
    expect(code).not.toContain("/project/src/api/users.ts");
  });

  it("generates apiRoutes with import and methods map in server target", () => {
    const apiRoutes: ApiRouteRecord[] = [
      {
        path: "/api/users",
        filePath: "/project/src/api/users.ts",
        type: "api",
        httpMethods: ["GET", "POST"],
        params: [],
        isCatchAll: false,
        isIndex: false,
        priority: 110,
      },
    ];

    const code = generateRoutesModule([], { target: "server", apiRoutes });

    expect(code).toContain('import * as _api0 from "/project/src/api/users.ts"');
    expect(code).toContain("export const apiRoutes = [");
    expect(code).toContain('path: "/api/users"');
    expect(code).toContain('type: "api"');
    expect(code).toContain("GET: _api0.GET");
    expect(code).toContain("POST: _api0.POST");

    assertValidModule(code);
  });

  it("generates empty when no apiRoutes provided", () => {
    const code = generateRoutesModule([], { target: "server" });

    expect(code).not.toContain("apiRoutes");
    expect(code).not.toContain("_api");
  });
});

describe("generateClientProxy", () => {
  it("returns null when there are no server-only exports", () => {
    const result = generateClientProxy("/pages/index.tsx", ["default"]);
    expect(result).toBeNull();
  });

  it("returns null for only client-safe exports", () => {
    const result = generateClientProxy("/pages/index.tsx", ["default", "prerender", "csr"]);
    expect(result).toBeNull();
  });

  it("generates proxy that strips loader export", () => {
    const result = generateClientProxy("/pages/index.tsx", ["default", "loader"]);
    expect(result).not.toBeNull();
    expect(result).toContain("default");
    expect(result).not.toContain("loader");
    expect(result).toContain('from "/pages/index.tsx"');
  });

  it("generates proxy that strips getStaticPaths export", () => {
    const result = generateClientProxy("/pages/blog.tsx", [
      "default",
      "prerender",
      "getStaticPaths",
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain("default");
    expect(result).toContain("prerender");
    expect(result).not.toContain("getStaticPaths");
  });

  it("generates proxy that strips both loader and getStaticPaths", () => {
    const result = generateClientProxy("/pages/blog.tsx", [
      "default",
      "loader",
      "getStaticPaths",
      "prerender",
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain("default");
    expect(result).toContain("prerender");
    expect(result).not.toContain("loader");
    expect(result).not.toContain("getStaticPaths");
  });

  it("returns empty export when all exports are server-only", () => {
    const result = generateClientProxy("/pages/api.tsx", ["loader"]);
    expect(result).toBe("export {};");
  });

  it("generates valid JS", () => {
    const result = generateClientProxy("/pages/index.tsx", ["default", "loader", "prerender"]);
    expect(result).not.toBeNull();
    expect(() => parse(result!, { ecmaVersion: "latest", sourceType: "module" })).not.toThrow();
  });
});
