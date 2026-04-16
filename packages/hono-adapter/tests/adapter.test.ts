import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RedirectResponse, stripBase } from "@calumet/suamox";
import type { RenderOptions, RenderResult } from "@calumet/suamox";
import type { ViteDevServer } from "vite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  renderPage: vi.fn(),
  generateHTML: vi.fn(),
  serializeData: vi.fn((data: unknown) => JSON.stringify(data)),
  matchRoute: vi.fn(() => null),
  resolveRouteModule: vi.fn((route: unknown) => Promise.resolve(route)),
}));

vi.mock("@calumet/suamox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@calumet/suamox")>();
  return {
    renderPage: mocks.renderPage,
    generateHTML: mocks.generateHTML,
    serializeData: mocks.serializeData,
    matchRoute: mocks.matchRoute,
    resolveRouteModule: mocks.resolveRouteModule,
    stripBase: actual.stripBase,
    RedirectResponse: actual.RedirectResponse,
  };
});

import { createDevHandler, createHonoApp, createProdHandler } from "../src/index";

const runtimeModule = {
  renderPage: mocks.renderPage,
  matchRoute: mocks.matchRoute,
  resolveRouteModule: mocks.resolveRouteModule,
  stripBase,
  RedirectResponse,
};

const createSsrLoadModule = (routes: unknown[], middlewareFn?: unknown) =>
  vi.fn((id: string) => {
    if (id === "@calumet/suamox") {
      return Promise.resolve(runtimeModule);
    }
    if (id === "virtual:pages/server") {
      return Promise.resolve({
        routes,
        ...(middlewareFn ? { onRequest: middlewareFn } : {}),
      });
    }
    return Promise.resolve({ routes });
  });

describe("createHonoApp", () => {
  it("exposes a health endpoint", async () => {
    const app = createHonoApp();

    const response = await app.request("http://localhost/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

describe("createDevHandler", () => {
  beforeEach(() => {
    mocks.renderPage.mockReset();
    mocks.generateHTML.mockReset();
    mocks.serializeData.mockClear();
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(null);
    mocks.resolveRouteModule.mockReset();
    mocks.resolveRouteModule.mockImplementation((route: unknown) => Promise.resolve(route));
  });

  it("runs hooks and injects initial data with css links from entry-client", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-dev-"));
    await mkdir(join(root, "src", "styles"), { recursive: true });
    await writeFile(
      join(root, "src", "entry-client.tsx"),
      "import './styles/global.css';\nvoid Promise.resolve();\n",
    );
    await writeFile(join(root, "src", "styles", "global.css"), "body{color:red}");

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Before</div>",
      head: "<title>Dev</title>",
      initialData: { ok: true },
    });

    const routes: unknown[] = [];
    const transformIndexHtml = vi.fn((_url: string, html: string) => Promise.resolve(html));
    const vite = {
      ssrLoadModule: createSsrLoadModule(routes),
      transformIndexHtml,
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const onBeforeRender = vi.fn((ctx: RenderOptions) => ({ ...ctx, pathname: "/changed" }));
    const onAfterRender = vi.fn((result: RenderResult) => ({
      ...result,
      html: "<div>After</div>",
    }));

    const app = createDevHandler({ vite, onBeforeRender, onAfterRender, root });
    const response = await app.request("http://localhost/");
    const body = await response.text();

    expect(onBeforeRender).toHaveBeenCalledTimes(1);
    expect(mocks.renderPage).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/changed" }),
    );
    expect(onAfterRender).toHaveBeenCalledTimes(1);
    expect(transformIndexHtml).toHaveBeenCalledTimes(1);
    expect(body).toContain("<div>After</div>");
    expect(body).toContain('window.__INITIAL_DATA__ = {"ok":true}');
    expect(body).toContain('<link rel="stylesheet" href="/src/styles/global.css">');
  });

  it("injects multiple css imports from entry-client", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-dev-"));
    await mkdir(join(root, "src", "styles"), { recursive: true });
    await writeFile(
      join(root, "src", "entry-client.tsx"),
      "import './styles/global.css';\nimport './styles/theme.css';\nvoid Promise.resolve();\n",
    );
    await writeFile(join(root, "src", "styles", "global.css"), "body{margin:0}");
    await writeFile(join(root, "src", "styles", "theme.css"), ":root{color-scheme:light}");

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Page</div>",
      head: "",
      initialData: null,
    });
    const vite = {
      ssrLoadModule: createSsrLoadModule([]),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/");
    const body = await response.text();

    expect(body).toContain('<link rel="stylesheet" href="/src/styles/global.css">');
    expect(body).toContain('<link rel="stylesheet" href="/src/styles/theme.css">');
  });

  it("skips missing css imports referenced by entry-client", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-dev-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "src", "entry-client.tsx"),
      "import './styles/missing.css';\nvoid Promise.resolve();\n",
    );

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Page</div>",
      head: "",
      initialData: null,
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([]),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.reject(new Error("missing"))),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/");
    const body = await response.text();

    expect(body).not.toContain('<link rel="stylesheet"');
    expect(response.status).toBe(200);
  });

  it("refreshes css links when entry-client imports change", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-dev-"));
    await mkdir(join(root, "src", "styles"), { recursive: true });
    await writeFile(
      join(root, "src", "entry-client.tsx"),
      "import './styles/first.css';\nvoid Promise.resolve();\n",
    );
    await writeFile(join(root, "src", "styles", "first.css"), "body{margin:0}");
    await writeFile(join(root, "src", "styles", "second.css"), "body{padding:0}");

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Page</div>",
      head: "",
      initialData: null,
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([]),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });

    const firstResponse = await app.request("http://localhost/");
    const firstBody = await firstResponse.text();
    expect(firstBody).toContain('<link rel="stylesheet" href="/src/styles/first.css">');
    expect(firstBody).not.toContain('<link rel="stylesheet" href="/src/styles/second.css">');

    await writeFile(
      join(root, "src", "entry-client.tsx"),
      "import './styles/second.css';\nvoid Promise.resolve();\n",
    );

    const secondResponse = await app.request("http://localhost/");
    const secondBody = await secondResponse.text();
    expect(secondBody).toContain('<link rel="stylesheet" href="/src/styles/second.css">');
    expect(secondBody).not.toContain('<link rel="stylesheet" href="/src/styles/first.css">');
  });

  it("resolves getStaticPaths props and passes them to renderPage", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-dev-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "entry-client.tsx"), "void 0;\n");

    const route = {
      path: "/:lang/contenido/*",
      params: ["lang", "slug"],
      getStaticPaths: () =>
        Promise.resolve([
          { params: { lang: "es", slug: "mision" }, props: { contenido: "<p>Misión</p>" } },
          { params: { lang: "en", slug: "mission" }, props: { contenido: "<p>Mission</p>" } },
        ]),
    };

    mocks.matchRoute.mockReturnValue({
      route,
      params: { lang: "es", slug: "mision" },
    });
    mocks.resolveRouteModule.mockResolvedValue(route);

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Page</div>",
      head: "",
      initialData: null,
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([route]),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    await app.request("http://localhost/es/contenido/mision");

    expect(mocks.renderPage).toHaveBeenCalledWith(
      expect.objectContaining({
        props: { contenido: "<p>Misión</p>" },
      }),
    );
  });

  it("does not pass props when route has no getStaticPaths", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-dev-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "entry-client.tsx"), "void 0;\n");

    const route = { path: "/about", params: [] };

    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>About</div>",
      head: "",
      initialData: null,
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([route]),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    await app.request("http://localhost/about");

    expect(mocks.renderPage).toHaveBeenCalledWith(
      expect.objectContaining({
        props: undefined,
      }),
    );
  });
});

describe("createDevHandler /__data endpoint", () => {
  const createViteMock = (routes: unknown[] = [], loaderRoute?: unknown) => {
    const resolvedRoutes = loaderRoute ? [loaderRoute] : routes;
    return {
      ssrLoadModule: createSsrLoadModule(resolvedRoutes),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;
  };

  beforeEach(() => {
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(null);
    mocks.resolveRouteModule.mockReset();
    mocks.resolveRouteModule.mockImplementation((route: unknown) => Promise.resolve(route));
  });

  it("returns 400 when path parameter is missing", async () => {
    const vite = createViteMock();
    const app = createDevHandler({ vite });

    const response = await app.request("http://localhost/__data");

    expect(response.status).toBe(400);
    const json: unknown = await response.json();
    expect(json).toEqual({ error: "Missing path parameter" });
  });

  it("returns 404 when route is not found", async () => {
    const vite = createViteMock();
    const app = createDevHandler({ vite });

    const response = await app.request("http://localhost/__data?path=/nonexistent");

    expect(response.status).toBe(404);
  });

  it("returns null when route has no loader", async () => {
    const route = { path: "/about", params: [] };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    const response = await app.request("http://localhost/__data?path=/about");

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toBeNull();
  });

  it("executes loader and returns data as JSON", async () => {
    const loaderData = { items: [{ id: 1, name: "Test" }] };
    const route = {
      path: "/api",
      params: [],
      loader: vi.fn(() => Promise.resolve(loaderData)),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    const response = await app.request("http://localhost/__data?path=/api");

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toEqual(loaderData);
    expect(route.loader).toHaveBeenCalledTimes(1);
  });

  it("passes correct params to loader context", async () => {
    const route = {
      path: "/blog/:slug",
      params: ["slug"],
      loader: vi.fn(() => Promise.resolve({ title: "Post" })),
    };
    mocks.matchRoute.mockReturnValue({ route, params: { slug: "hello" } });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    await app.request("http://localhost/__data?path=/blog/hello");

    expect(route.loader).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { slug: "hello" },
      }),
    );
  });

  it("forwards query parameters to loader context (excluding path)", async () => {
    const route = {
      path: "/search",
      params: [],
      loader: vi.fn(() => Promise.resolve({ results: [] })),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    await app.request("http://localhost/__data?path=/search&q=test&page=2");

    const call = route.loader.mock.calls[0]![0] as { query: URLSearchParams };
    expect(call.query.get("q")).toBe("test");
    expect(call.query.get("page")).toBe("2");
    expect(call.query.has("path")).toBe(false);
  });

  it("serializes RedirectResponse as JSON with __redirect field", async () => {
    const { RedirectResponse } = await import("@calumet/suamox");
    const route = {
      path: "/old",
      params: [],
      loader: vi.fn(() => {
        throw new RedirectResponse("/new", 301);
      }),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    const response = await app.request("http://localhost/__data?path=/old");

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toEqual({ __redirect: "/new", __status: 301 });
  });

  it("returns 500 when loader throws an error", async () => {
    const route = {
      path: "/broken",
      params: [],
      loader: vi.fn(() => Promise.reject(new Error("DB connection failed"))),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    const response = await app.request("http://localhost/__data?path=/broken");

    expect(response.status).toBe(500);
    const json: unknown = await response.json();
    expect(json).toEqual({ error: "Loader error" });
  });

  it("passes original request with headers and cookies to loader", async () => {
    let capturedRequest: Request | undefined;
    const route = {
      path: "/protected",
      params: [],
      loader: vi.fn((ctx: { request: Request }) => {
        capturedRequest = ctx.request;
        return { user: "test" };
      }),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    await app.request("http://localhost/__data?path=/protected", {
      headers: {
        cookie: "session=abc123; token=xyz",
        authorization: "Bearer mytoken",
      },
    });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.headers.get("cookie")).toBe("session=abc123; token=xyz");
    expect(capturedRequest!.headers.get("authorization")).toBe("Bearer mytoken");
  });

  it("loads routes from virtual:pages/server module", async () => {
    const route = { path: "/about", params: [] };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const ssrLoadModuleFn = createSsrLoadModule([route]);
    const vite = {
      ssrLoadModule: ssrLoadModuleFn,
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn(),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    await app.request("http://localhost/__data?path=/about");

    expect(ssrLoadModuleFn).toHaveBeenCalledWith("virtual:pages/server");
  });
});

describe("createProdHandler", () => {
  beforeEach(() => {
    mocks.renderPage.mockReset();
    mocks.generateHTML.mockReset();
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(null);
  });

  it("uses the manifest client entry for scripts and styles", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-hono-"));
    const serverDir = join(root, "dist", "server");
    const clientDir = join(root, "dist", "client", ".vite");
    const staticDir = join(root, "dist", "static");
    const routeFilePath = join(root, "src", "pages", "index.tsx");

    await mkdir(serverDir, { recursive: true });
    await mkdir(clientDir, { recursive: true });
    await mkdir(staticDir, { recursive: true });
    await writeFile(
      join(serverDir, "entry-server.mjs"),
      `export const routes = [{ path: '/', filePath: ${JSON.stringify(routeFilePath)} }];`,
    );
    await writeFile(
      join(clientDir, "manifest.json"),
      JSON.stringify({
        "index.html": {
          file: "assets/client.js",
          imports: ["assets/chunk.js"],
          css: ["assets/client.css"],
        },
        "src/pages/index.tsx": {
          file: "assets/index.js",
          imports: ["assets/chunk.js"],
          css: ["assets/index.css"],
        },
        "assets/chunk.js": {
          file: "assets/chunk.js",
          css: ["assets/chunk.css"],
        },
      }),
    );
    mocks.matchRoute.mockReturnValue({
      route: { filePath: routeFilePath },
      params: {},
    });

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Prod</div>",
      head: "",
      initialData: null,
    });
    mocks.generateHTML.mockImplementation(
      ({ html, scripts, styles }: { html: string; scripts?: string[]; styles?: string[] }) => {
        return `<html>${html}<script src="${scripts?.[0] ?? ""}"></script><link rel="stylesheet" href="${styles?.[0] ?? ""}"></html>`;
      },
    );

    const app = createProdHandler({
      root,
      clientDir: join(root, "dist", "client"),
      serverEntry: join(root, "dist", "server", "entry-server.mjs"),
      staticDir: join(root, "dist", "static"),
    });
    const response = await app.request("http://localhost/");
    const body = await response.text();

    expect(mocks.generateHTML).toHaveBeenCalledWith(
      expect.objectContaining({
        scripts: ["/assets/client.js"],
        preloadScripts: ["/assets/client.js", "/assets/chunk.js", "/assets/index.js"],
        styles: ["/assets/client.css", "/assets/chunk.css", "/assets/index.css"],
        scriptPlacement: "head",
      }),
    );
    expect(body).toContain("/assets/client.js");
    expect(body).toContain("/assets/client.css");
  });
});

describe("createProdHandler /__data endpoint", () => {
  const createProdApp = async (loaderRoute?: {
    path: string;
    params: string[];
    loader?: ReturnType<typeof vi.fn>;
  }) => {
    const root = await mkdtemp(join(tmpdir(), "suamox-data-"));
    const serverDir = join(root, "dist", "server");
    const clientDir = join(root, "dist", "client", ".vite");
    const staticDir = join(root, "dist", "static");

    await mkdir(serverDir, { recursive: true });
    await mkdir(clientDir, { recursive: true });
    await mkdir(staticDir, { recursive: true });

    const routeExport = loaderRoute
      ? `[{ path: '${loaderRoute.path}', params: ${JSON.stringify(loaderRoute.params)} }]`
      : "[]";
    await writeFile(join(serverDir, "entry-server.mjs"), `export const routes = ${routeExport};`);
    await writeFile(join(clientDir, "manifest.json"), JSON.stringify({}));

    return createProdHandler({
      root,
      clientDir: join(root, "dist", "client"),
      serverEntry: join(root, "dist", "server", "entry-server.mjs"),
      staticDir,
    });
  };

  beforeEach(() => {
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(null);
    mocks.resolveRouteModule.mockReset();
    mocks.resolveRouteModule.mockImplementation((route: unknown) => Promise.resolve(route));
  });

  it("returns 400 when path parameter is missing", async () => {
    const app = await createProdApp();

    const response = await app.request("http://localhost/__data");

    expect(response.status).toBe(400);
  });

  it("returns 404 when route is not found", async () => {
    const app = await createProdApp();

    const response = await app.request("http://localhost/__data?path=/nonexistent");

    expect(response.status).toBe(404);
  });

  it("returns null when route has no loader", async () => {
    const route = { path: "/about", params: [] };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const app = await createProdApp(route);

    const response = await app.request("http://localhost/__data?path=/about");

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toBeNull();
  });

  it("executes loader and returns data as JSON", async () => {
    const loaderData = { menus: ["Inicio", "Contacto"] };
    const route = {
      path: "/menu",
      params: [],
      loader: vi.fn(() => Promise.resolve(loaderData)),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const app = await createProdApp(route);

    const response = await app.request("http://localhost/__data?path=/menu");

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toEqual(loaderData);
  });

  it("serializes RedirectResponse as JSON with __redirect field", async () => {
    const { RedirectResponse } = await import("@calumet/suamox");
    const route = {
      path: "/old",
      params: [],
      loader: vi.fn(() => {
        throw new RedirectResponse("/new", 302);
      }),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const app = await createProdApp(route);

    const response = await app.request("http://localhost/__data?path=/old");

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toEqual({ __redirect: "/new", __status: 302 });
  });

  it("returns 500 when loader throws an error", async () => {
    const route = {
      path: "/broken",
      params: [],
      loader: vi.fn(() => Promise.reject(new Error("Internal error"))),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const app = await createProdApp(route);

    const response = await app.request("http://localhost/__data?path=/broken");

    expect(response.status).toBe(500);
    const json: unknown = await response.json();
    expect(json).toEqual({ error: "Loader error" });
  });
});

describe("createDevHandler middleware", () => {
  beforeEach(() => {
    mocks.renderPage.mockReset();
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(null);
    mocks.resolveRouteModule.mockReset();
    mocks.resolveRouteModule.mockImplementation((route: unknown) => Promise.resolve(route));
  });

  it("passes locals from middleware to loader context via __data", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-mw-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "entry-client.tsx"), "void 0;\n");

    const route = {
      path: "/api",
      params: [],
      loader: vi.fn((ctx: { locals: Record<string, unknown> }) =>
        Promise.resolve({ user: ctx.locals.user }),
      ),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const middlewareFn = vi.fn(
      async (ctx: { locals: Record<string, unknown> }, next: () => Promise<Response>) => {
        ctx.locals.user = { id: 1, name: "Admin" };
        return next();
      },
    );

    const vite = {
      ssrLoadModule: createSsrLoadModule([route], middlewareFn),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/__data?path=/api");

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toEqual({ user: { id: 1, name: "Admin" } });
    expect(middlewareFn).toHaveBeenCalledTimes(1);
  });

  it("short-circuits when middleware does not call next", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-mw-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "entry-client.tsx"), "void 0;\n");

    const middlewareFn = vi.fn(() => {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([], middlewareFn),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/");

    expect(response.status).toBe(401);
    const json: unknown = await response.json();
    expect(json).toEqual({ error: "unauthorized" });
  });

  it("locals object is not serialized in __INITIAL_DATA__", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-mw-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "entry-client.tsx"), "void 0;\n");

    const middlewareFn = vi.fn(
      async (ctx: { locals: Record<string, unknown> }, next: () => Promise<Response>) => {
        ctx.locals.secret = "server-only-token";
        return next();
      },
    );

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Page</div>",
      head: "",
      initialData: { public: "data" },
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([], middlewareFn),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/");
    const body = await response.text();

    expect(body).toContain('window.__INITIAL_DATA__ = {"public":"data"}');
    expect(body).not.toContain("server-only-token");
    expect(body).not.toContain("secret");
  });

  it("middleware can wrap the response returned by next()", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-mw-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "entry-client.tsx"), "void 0;\n");

    const middlewareFn = vi.fn(
      async (_ctx: { locals: Record<string, unknown> }, next: () => Promise<Response>) => {
        const response = await next();
        response.headers.set("x-cache", "MISS");
        return response;
      },
    );

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Cached</div>",
      head: "",
      initialData: null,
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([], middlewareFn),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache")).toBe("MISS");
    const body = await response.text();
    expect(body).toContain("<div>Cached</div>");
  });

  it("middleware can read the response body from next() and cache it", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-mw-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "entry-client.tsx"), "void 0;\n");

    let cachedHtml = "";
    const middlewareFn = vi.fn(
      async (_ctx: { locals: Record<string, unknown> }, next: () => Promise<Response>) => {
        const response = await next();
        cachedHtml = await response.clone().text();
        response.headers.set("x-cache", "MISS");
        return response;
      },
    );

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Page</div>",
      head: "<title>Test</title>",
      initialData: null,
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([], middlewareFn),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/");

    expect(response.status).toBe(200);
    expect(cachedHtml).toContain("<div>Page</div>");
    expect(cachedHtml).toContain("<title>Test</title>");
    expect(response.headers.get("x-cache")).toBe("MISS");
  });

  it("short-circuits without calling next() and skips the render pipeline", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-mw-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "entry-client.tsx"), "void 0;\n");

    const middlewareFn = vi.fn(() => {
      return new Response("cached html", {
        status: 200,
        headers: { "content-type": "text/html", "x-cache": "HIT" },
      });
    });

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Should not render</div>",
      head: "",
      initialData: null,
    });

    const vite = {
      ssrLoadModule: createSsrLoadModule([], middlewareFn),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cache")).toBe("HIT");
    expect(body).toBe("cached html");
    expect(mocks.renderPage).not.toHaveBeenCalled();
  });
});

describe("createProdHandler proxy", () => {
  let backend: import("node:http").Server;
  let backendPort: number;

  beforeAll(async () => {
    const { createServer } = await import("node:http");
    backend = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost`);
      res.setHeader("Content-Type", "application/json");

      if (url.pathname === "/api/data") {
        res.end(JSON.stringify({ source: "backend", cookie: req.headers.cookie ?? null }));
      } else if (url.pathname === "/api/echo-query") {
        res.end(JSON.stringify({ search: url.search }));
      } else if (url.pathname === "/api") {
        res.end(JSON.stringify({ root: true }));
      } else if (req.method === "POST" && url.pathname === "/api/submit") {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          res.end(JSON.stringify({ received: body }));
        });
      } else if (url.pathname === "/api/set-cookie") {
        res.setHeader("Set-Cookie", "session=abc123; Path=/; HttpOnly");
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
      }
    });

    await new Promise<void>((resolve) => {
      backend.listen(0, "127.0.0.1", () => {
        const addr = backend.address();
        backendPort = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(() => {
    backend.close();
  });

  const createProxiedApp = async (proxyConfig: import("../src/index").ProxyConfig) => {
    const root = await mkdtemp(join(tmpdir(), "suamox-proxy-"));
    const serverDir = join(root, "dist", "server");
    const clientDir = join(root, "dist", "client", ".vite");
    const staticDir = join(root, "dist", "static");

    await mkdir(serverDir, { recursive: true });
    await mkdir(clientDir, { recursive: true });
    await mkdir(staticDir, { recursive: true });
    await writeFile(join(serverDir, "entry-server.mjs"), "export const routes = [];");
    await writeFile(join(clientDir, "manifest.json"), "{}");

    return createProdHandler({
      root,
      clientDir: join(root, "dist", "client"),
      serverEntry: join(root, "dist", "server", "entry-server.mjs"),
      staticDir,
      proxy: proxyConfig,
    });
  };

  it("forwards GET requests to the target backend", async () => {
    const app = await createProxiedApp({
      "/api": `http://127.0.0.1:${backendPort}`,
    });

    const res = await app.request("http://localhost/api/data");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { source: string };
    expect(json.source).toBe("backend");
  });

  it("forwards cookies from the client to the backend", async () => {
    const app = await createProxiedApp({
      "/api": `http://127.0.0.1:${backendPort}`,
    });

    const res = await app.request("http://localhost/api/data", {
      headers: { cookie: "JSESSIONID=test123" },
    });
    const json = (await res.json()) as { cookie: string };
    expect(json.cookie).toContain("JSESSIONID=test123");
  });

  it("forwards Set-Cookie headers from the backend to the client", async () => {
    const app = await createProxiedApp({
      "/api": `http://127.0.0.1:${backendPort}`,
    });

    const res = await app.request("http://localhost/api/set-cookie");
    expect(res.headers.get("set-cookie")).toContain("session=abc123");
  });

  it("forwards query string parameters", async () => {
    const app = await createProxiedApp({
      "/api": `http://127.0.0.1:${backendPort}`,
    });

    const res = await app.request("http://localhost/api/echo-query?foo=bar&baz=1");
    const json = (await res.json()) as { search: string };
    expect(json.search).toBe("?foo=bar&baz=1");
  });

  it("forwards POST requests with body", async () => {
    const app = await createProxiedApp({
      "/api": `http://127.0.0.1:${backendPort}`,
    });

    const res = await app.request("http://localhost/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    const json = (await res.json()) as { received: string };
    expect(json.received).toBe('{"name":"test"}');
  });

  it("matches exact proxy path", async () => {
    const app = await createProxiedApp({
      "/api": `http://127.0.0.1:${backendPort}`,
    });

    const res = await app.request("http://localhost/api");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { root: boolean };
    expect(json.root).toBe(true);
  });

  it("returns 404 for non-matching paths on the backend", async () => {
    const app = await createProxiedApp({
      "/api": `http://127.0.0.1:${backendPort}`,
    });

    const res = await app.request("http://localhost/api/nonexistent");
    expect(res.status).toBe(404);
  });
});
