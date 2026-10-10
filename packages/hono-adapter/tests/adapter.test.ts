import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RedirectResponse, registerReroute, stripBase } from "@calumet/suamox";
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
    // El real: es el que traduce la URL para el middleware y lo que se prueba
    resolveRoutePathname: actual.resolveRoutePathname,
    registerReroute: actual.registerReroute,
    stripBase: actual.stripBase,
    RedirectResponse: actual.RedirectResponse,
  };
});

vi.mock("@calumet/suamox/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@calumet/suamox/server")>();
  return {
    renderPage: mocks.renderPage,
    // El real: las acciones de las pruebas leen su contexto
    runWithActionContext: actual.runWithActionContext,
    getActionContext: actual.getActionContext,
  };
});

import { getActionContext } from "@calumet/suamox/server";

import { createDevHandler, createHonoApp, createProdHandler } from "../src/index";

const runtimeModule = {
  renderPage: mocks.renderPage,
  matchRoute: mocks.matchRoute,
  resolveRouteModule: mocks.resolveRouteModule,
  stripBase,
  RedirectResponse,
};

const createSsrImport = (routes: unknown[], middlewareFn?: unknown) =>
  vi.fn((id: string) => {
    if (id === "@calumet/suamox") {
      return Promise.resolve(runtimeModule);
    }
    if (id === "@calumet/suamox/server") {
      return Promise.resolve({ renderPage: mocks.renderPage });
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
  beforeEach(async () => {
    mocks.renderPage.mockReset();
    mocks.generateHTML.mockReset();
    // Desarrollo arma el documento con la misma plantilla que produccion, asi
    // que aqui interesa la de verdad: lo que se comprueba es su salida
    const actual = await vi.importActual<typeof import("@calumet/suamox")>("@calumet/suamox");
    mocks.generateHTML.mockImplementation(actual.generateHTML);
    mocks.serializeData.mockClear();
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(null);
    mocks.resolveRouteModule.mockReset();
    mocks.resolveRouteModule.mockImplementation((route: unknown) => Promise.resolve(route));
  });

  it("runs hooks and injects initial data", async () => {
    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: "<div>Before</div>",
      head: "<title>Dev</title>",
      initialData: { ok: true },
    });

    const routes: unknown[] = [];
    const transformIndexHtml = vi.fn((_url: string, html: string) => Promise.resolve(html));
    const vite = {
      environments: {
        ssr: { runner: { import: createSsrImport(routes) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml,
    } as unknown as ViteDevServer;

    const onBeforeRender = vi.fn((ctx: RenderOptions) => ({ ...ctx, pathname: "/changed" }));
    const onAfterRender = vi.fn((result: RenderResult) => ({
      ...result,
      html: "<div>After</div>",
    }));

    const app = createDevHandler({ vite, onBeforeRender, onAfterRender });
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
      environments: {
        ssr: { runner: { import: createSsrImport([route]) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
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
      environments: {
        ssr: { runner: { import: createSsrImport([route]) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
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
      environments: {
        ssr: { runner: { import: createSsrImport(resolvedRoutes) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
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

  it("serializes a RedirectResponse thrown by another copy of the module", async () => {
    class ForeignRedirect extends Error {
      readonly location = "/login";
      readonly status = 302;

      constructor() {
        super("Redirect to /login");
        this.name = "RedirectResponse";
        Object.defineProperty(this, Symbol.for("suamox.RedirectResponse"), { value: true });
      }
    }

    const route = {
      path: "/privado",
      params: [],
      loader: vi.fn(() => {
        throw new ForeignRedirect();
      }),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    const response = await app.request("http://localhost/__data?path=/privado");

    expect(response.status).toBe(200);
    const json: unknown = await response.json();
    expect(json).toEqual({ __redirect: "/login", __status: 302 });
  });

  it("returns 500 for a branded object without a location", async () => {
    const malformed = new Error("Redirect to nowhere");
    malformed.name = "RedirectResponse";
    Object.defineProperty(malformed, Symbol.for("suamox.RedirectResponse"), { value: true });

    const route = {
      path: "/malformado",
      params: [],
      loader: vi.fn(() => {
        throw malformed;
      }),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = createViteMock([], route);
    const app = createDevHandler({ vite });

    const response = await app.request("http://localhost/__data?path=/malformado");

    expect(response.status).toBe(500);
    const json: unknown = await response.json();
    expect(json).toEqual({ error: "Loader error" });
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

    const ssrImportFn = createSsrImport([route]);
    const vite = {
      environments: {
        ssr: { runner: { import: ssrImportFn } },
        client: { transformRequest: vi.fn() },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    await app.request("http://localhost/__data?path=/about");

    expect(ssrImportFn).toHaveBeenCalledWith("virtual:pages/server");
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
        // La entrada se busca por `isEntry`, no por su clave
        "virtual:pages/client-entry": {
          file: "assets/client.js",
          isEntry: true,
          imports: ["assets/chunk.js"],
          css: ["assets/client.css"],
        },
        // El build del cliente indexa paginas y layouts con el query de stripping
        "src/pages/index.tsx?__suamox-client-route": {
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

  it("precarga solo las fuentes de la ruta que elige el filtro del entry", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-fonts-"));
    const clientDir = join(root, "dist", "client");
    const routeFilePath = join(root, "src", "pages", "index.tsx");
    const layoutFilePath = join(root, "src", "pages", "root.tsx");

    await mkdir(join(root, "dist", "server"), { recursive: true });
    await mkdir(join(clientDir, ".vite"), { recursive: true });
    await writeFile(
      join(root, "dist", "server", "entry-server.mjs"),
      `export const routes = [];\nexport const preloadFonts = /-latin-wght-/;`,
    );
    await writeFile(
      join(clientDir, ".vite", "manifest.json"),
      JSON.stringify({
        "virtual:pages/client-entry": { file: "assets/client.js", isEntry: true },
        "src/pages/root.tsx?__suamox-client-route": {
          file: "assets/root.js",
          css: ["assets/root.css"],
          assets: [
            "assets/geist-latin-wght-normal-AAAA.woff2",
            "assets/geist-cyrillic-wght-normal-BBBB.woff2",
            "assets/logo-latin-wght-CCCC.png",
          ],
        },
      }),
    );
    mocks.matchRoute.mockReturnValue({
      route: { filePath: routeFilePath, layoutFilePaths: [layoutFilePath] },
      params: {},
    });
    mocks.renderPage.mockResolvedValue({ status: 200, html: "", head: "", initialData: null });
    mocks.generateHTML.mockReturnValue("<html></html>");

    const app = createProdHandler({
      root,
      clientDir,
      serverEntry: join(root, "dist", "server", "entry-server.mjs"),
      staticDir: join(root, "dist", "static"),
    });
    await app.request("http://localhost/");

    expect(mocks.generateHTML).toHaveBeenCalledWith(
      expect.objectContaining({ preloadFonts: ["/assets/geist-latin-wght-normal-AAAA.woff2"] }),
    );
  });

  // El HTML prerenderizado ya esta en disco: el middleware de la app no lo puede
  // cambiar, pero el hook del adaptador es infraestructura y aplica igual
  it("serves prerendered HTML after the adapter hook and without the app middleware", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-static-"));
    const serverDir = join(root, "dist", "server");
    const clientDir = join(root, "dist", "client", ".vite");
    const staticDir = join(root, "dist", "static");

    await mkdir(serverDir, { recursive: true });
    await mkdir(clientDir, { recursive: true });
    await mkdir(join(staticDir, "estatica"), { recursive: true });
    await writeFile(
      join(serverDir, "entry-server.mjs"),
      `export const routes = [];
       export function onRequest(context, next) {
         globalThis.__middlewareCorrio = true;
         return next();
       }`,
    );
    await writeFile(join(clientDir, "manifest.json"), "{}");
    await writeFile(join(staticDir, "estatica", "index.html"), "<html>prerenderizada</html>");

    (globalThis as { __middlewareCorrio?: boolean }).__middlewareCorrio = false;
    const onRequest = vi.fn((c: { header: (name: string, value: string) => void }) => {
      c.header("x-adapter-hook", "1");
    });

    const app = createProdHandler({
      root,
      clientDir: join(root, "dist", "client"),
      serverEntry: join(root, "dist", "server", "entry-server.mjs"),
      staticDir,
      onRequest,
    });

    const response = await app.request("http://localhost/estatica");

    expect(await response.text()).toBe("<html>prerenderizada</html>");
    expect(onRequest).toHaveBeenCalled();
    expect(response.headers.get("x-adapter-hook")).toBe("1");
    expect((globalThis as { __middlewareCorrio?: boolean }).__middlewareCorrio).toBe(false);
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
  beforeEach(async () => {
    mocks.renderPage.mockReset();
    mocks.generateHTML.mockReset();
    const actual = await vi.importActual<typeof import("@calumet/suamox")>("@calumet/suamox");
    mocks.generateHTML.mockImplementation(actual.generateHTML);
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
      environments: {
        ssr: { runner: { import: createSsrImport([route], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
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
      environments: {
        ssr: { runner: { import: createSsrImport([], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite, root });
    const response = await app.request("http://localhost/");

    expect(response.status).toBe(401);
    const json: unknown = await response.json();
    expect(json).toEqual({ error: "unauthorized" });
  });

  it("receives the requested route as pathname on /__data", async () => {
    const route = { path: "/panel", params: [], loader: vi.fn(() => Promise.resolve(null)) };
    mocks.matchRoute.mockReturnValue({ route, params: {}, pathname: "/panel" });
    mocks.resolveRouteModule.mockResolvedValue(route);

    let pathname: string | undefined;
    const middlewareFn = vi.fn(async (ctx: { pathname: string }, next: () => Promise<Response>) => {
      pathname = ctx.pathname;
      return next();
    });

    const vite = {
      environments: {
        ssr: { runner: { import: createSsrImport([route], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    const response = await app.request("http://localhost/__data?path=/panel");

    expect(response.status).toBe(200);
    expect(pathname).toBe("/panel");
  });

  // Si el middleware viera la URL pedida, un alias saltaria cualquier guardia por ruta.
  // No se lee de `match`: un entry-server puede exportar su propio matchRoute
  it("receives the rerouted pathname, not the requested one", async () => {
    const route = { path: "/panel", params: [], loader: vi.fn(() => Promise.resolve(null)) };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);
    registerReroute((p) => (p.startsWith("/alias/") ? p.slice(6) : undefined));

    let pathname: string | undefined;
    const middlewareFn = vi.fn(async (ctx: { pathname: string }, next: () => Promise<Response>) => {
      pathname = ctx.pathname;
      return next();
    });

    const vite = {
      environments: {
        ssr: { runner: { import: createSsrImport([route], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    await app.request("http://localhost/__data?path=/alias/panel");
    registerReroute(null);

    expect(pathname).toBe("/panel");
  });

  // `/\evil.com` resuelve al origen evil.com, y las guias dicen que confies en pathname
  it("never hands the middleware a pathname that resolves off-origin", async () => {
    const route = { path: "/*", params: ["all"], loader: vi.fn(() => Promise.resolve(null)) };
    mocks.matchRoute.mockReturnValue({ route, params: {} });
    mocks.resolveRouteModule.mockResolvedValue(route);

    let pathname: string | undefined;
    const middlewareFn = vi.fn(async (ctx: { pathname: string }, next: () => Promise<Response>) => {
      pathname = ctx.pathname;
      return next();
    });

    const vite = {
      environments: {
        ssr: { runner: { import: createSsrImport([route], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    await app.request("http://localhost/__data?path=/%5Cevil.com");

    expect(new URL(pathname!, "http://app.example").origin).toBe("http://app.example");
  });

  // Llamar next() dos veces correria los loaders y el render otra vez, en silencio
  it("rejects a middleware that calls next() twice", async () => {
    const route = { path: "/panel", params: [], loader: vi.fn(() => Promise.resolve(null)) };
    mocks.matchRoute.mockReturnValue({ route, params: {}, pathname: "/panel" });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const middlewareFn = vi.fn(async (_ctx: unknown, next: () => Promise<Response>) => {
      await next();
      return next();
    });

    const vite = {
      environments: {
        ssr: { runner: { import: createSsrImport([route], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    const response = await app.request("http://localhost/__data?path=/panel");

    expect(response.status).toBe(500);
  });

  it("rejects a middleware that returns something other than a Response", async () => {
    const route = { path: "/panel", params: [], loader: vi.fn(() => Promise.resolve(null)) };
    mocks.matchRoute.mockReturnValue({ route, params: {}, pathname: "/panel" });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const middlewareFn = vi.fn(() => ({ redirect: "/" }) as unknown as Response);

    const vite = {
      environments: {
        ssr: { runner: { import: createSsrImport([route], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    const response = await app.request("http://localhost/__data?path=/panel");

    expect(response.status).toBe(500);
  });

  // Descartarla dejaria la carpeta sin guardia en silencio: es el fallo que la
  // feature existe para evitar, asi que falla cerrado
  it("rejects a route middleware entry that is not a function", async () => {
    const route = {
      path: "/panel",
      params: [],
      middleware: [{ handler: () => undefined }],
      loader: vi.fn(() => Promise.resolve(null)),
    };
    mocks.matchRoute.mockReturnValue({ route, params: {}, pathname: "/panel" });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = {
      environments: {
        ssr: { runner: { import: createSsrImport([route]) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    const response = await app.request("http://localhost/__data?path=/panel");

    expect(response.status).toBe(500);
  });

  // El global entra por la posicion 0 del array. Descartarlo por no ser funcion
  // dejaba la ruta sin guardia y servia la pagina con 200
  it("refuses the request when the global middleware is not a function", async () => {
    const route = { path: "/panel", params: [], loader: vi.fn(() => Promise.resolve(null)) };
    mocks.matchRoute.mockReturnValue({ route, params: {}, pathname: "/panel" });
    mocks.resolveRouteModule.mockResolvedValue(route);

    const vite = {
      environments: {
        ssr: {
          runner: { import: createSsrImport([route], { handler: () => undefined }) },
        },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    const response = await app.request("http://localhost/__data?path=/panel");

    expect(response.status).toBe(500);
  });

  it("translates a redirect thrown by the middleware into a 302", async () => {
    const middlewareFn = vi.fn(() => {
      throw new RedirectResponse("/login");
    });

    const vite = {
      environments: {
        ssr: { runner: { import: createSsrImport([], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    const response = await app.request("http://localhost/panel");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
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
      environments: {
        ssr: { runner: { import: createSsrImport([], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
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
      environments: {
        ssr: { runner: { import: createSsrImport([], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
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
      environments: {
        ssr: { runner: { import: createSsrImport([], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
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
      environments: {
        ssr: { runner: { import: createSsrImport([], middlewareFn) } },
        client: { transformRequest: vi.fn((_url: string) => Promise.resolve({ code: "" })) },
      },
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
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

describe("createDevHandler /__actions endpoint", () => {
  const ACTION_ID = "0123456789abcdef";
  const sameOrigin = { "sec-fetch-site": "same-origin", "content-type": "application/json" };

  const createActionsApp = (
    actionsModule: Record<string, unknown>,
    middlewareFn?: (
      ctx: {
        locals: Record<string, unknown>;
        action?: { file: string; name: string };
        request: Request;
      },
      next: () => Promise<Response>,
    ) => Promise<Response>,
  ) => {
    const ssrImport = vi.fn((id: string) => {
      if (id === "/app/src/ajustes.actions.ts") {
        return Promise.resolve(actionsModule);
      }
      return Promise.resolve({ routes: [], ...(middlewareFn ? { onRequest: middlewareFn } : {}) });
    });
    const vite = {
      config: {
        plugins: [
          {
            name: "suamox:pages",
            api: {
              resolveAction: (id: string) =>
                id === ACTION_ID
                  ? {
                      file: "src/ajustes.actions.ts",
                      path: "/app/src/ajustes.actions.ts",
                      name: "guardar",
                    }
                  : undefined,
            },
          },
        ],
      },
      environments: { ssr: { runner: { import: ssrImport } } },
    } as unknown as ViteDevServer;
    return { app: createDevHandler({ vite }), ssrImport };
  };

  const post = (app: ReturnType<typeof createDevHandler>, init: RequestInit, id = ACTION_ID) =>
    app.request(`http://localhost/__actions/${id}`, { method: "POST", ...init });

  it("corre la acción con los argumentos en JSON y serializa lo que devuelve", async () => {
    const guardar = vi.fn((nombre: string, edad: number) => Promise.resolve({ nombre, edad }));
    const { app } = createActionsApp({ guardar });

    const response = await post(app, { headers: sameOrigin, body: JSON.stringify(["Ana", 30]) });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-suamox-action")).toBe("1");
    expect(await response.json()).toEqual({ nombre: "Ana", edad: 30 });
    expect(guardar).toHaveBeenCalledWith("Ana", 30);
  });

  it("responde 204 cuando la acción no devuelve nada", async () => {
    const { app } = createActionsApp({ guardar: () => Promise.resolve(undefined) });

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.status).toBe(204);
  });

  it("deja pasar tal cual el Response que devuelve la acción", async () => {
    const { app } = createActionsApp({
      guardar: () => Promise.resolve(Response.json({ codigo: "NO_VALIDO" }, { status: 422 })),
    });

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.status).toBe(422);
    expect(response.headers.get("x-suamox-action")).toBeNull();
    expect(await response.json()).toEqual({ codigo: "NO_VALIDO" });
  });

  it("entrega un FormData como único argumento", async () => {
    const guardar = vi.fn((form: FormData) => Promise.resolve(form.get("nombre")));
    const { app } = createActionsApp({ guardar });
    const form = new FormData();
    form.set("nombre", "Ana");

    const response = await post(app, { headers: { "sec-fetch-site": "same-origin" }, body: form });

    expect(response.status).toBe(200);
    expect(await response.json()).toBe("Ana");
  });

  it("da a la acción la petición y los locals del middleware global", async () => {
    let visto: { cookie: string | null; usuario: unknown } | undefined;
    const { app } = createActionsApp(
      {
        guardar: () => {
          const { request, locals } = getActionContext();
          visto = { cookie: request.headers.get("cookie"), usuario: locals.usuario };
          return Promise.resolve(undefined);
        },
      },
      (ctx, next) => {
        ctx.locals.usuario = "ana";
        return next();
      },
    );

    await post(app, { headers: { ...sameOrigin, cookie: "sesion=1" }, body: "[]" });

    expect(visto).toEqual({ cookie: "sesion=1", usuario: "ana" });
  });

  it("el middleware global puede cortar antes de que corra la acción", async () => {
    const guardar = vi.fn();
    const { app } = createActionsApp({ guardar }, () =>
      Promise.resolve(new Response("no", { status: 401 })),
    );

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.status).toBe(401);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("rechaza una petición de otro sitio sin cargar el módulo", async () => {
    const { app, ssrImport } = createActionsApp({ guardar: vi.fn() });

    const response = await post(app, {
      headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" },
      body: "[]",
    });

    expect(response.status).toBe(403);
    expect(ssrImport).not.toHaveBeenCalled();
  });

  it("sin Sec-Fetch-Site exige un Origin del mismo host", async () => {
    const { app } = createActionsApp({ guardar: () => Promise.resolve(undefined) });
    const json = { "content-type": "application/json" };

    expect((await post(app, { headers: json, body: "[]" })).status).toBe(403);
    expect(
      (await post(app, { headers: { ...json, origin: "https://otro.com" }, body: "[]" })).status,
    ).toBe(403);
    expect(
      (await post(app, { headers: { ...json, origin: "http://localhost" }, body: "[]" })).status,
    ).toBe(204);
  });

  it("responde 404 a un id desconocido o mal formado", async () => {
    const { app } = createActionsApp({ guardar: vi.fn() });

    expect((await post(app, { headers: sameOrigin, body: "[]" }, "ffffffffffffffff")).status).toBe(
      404,
    );
    expect((await post(app, { headers: sameOrigin, body: "[]" }, "constructor")).status).toBe(404);
  });

  it("responde 400 si el cuerpo no es una lista JSON ni un formulario", async () => {
    const guardar = vi.fn();
    const { app } = createActionsApp({ guardar });

    expect((await post(app, { headers: sameOrigin, body: `{"a":1}` })).status).toBe(400);
    expect((await post(app, { headers: sameOrigin, body: "no es json" })).status).toBe(400);
    expect(
      (
        await post(app, {
          headers: { "sec-fetch-site": "same-origin", "content-type": "text/plain" },
          body: "[]",
        })
      ).status,
    ).toBe(400);
    expect(guardar).not.toHaveBeenCalled();
  });

  it("no filtra el error de la acción", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = createActionsApp({
      guardar: () => Promise.reject(new Error("token=secreto")),
    });

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secreto");
    error.mockRestore();
  });

  it("una redirección del middleware viaja en cabeceras y no como 3xx", async () => {
    const guardar = vi.fn();
    const { app } = createActionsApp({ guardar }, () =>
      Promise.resolve(new Response(null, { status: 302, headers: { location: "/ingresar" } })),
    );

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.status).toBe(204);
    expect(response.headers.get("x-suamox-redirect")).toBe("/ingresar");
    expect(response.headers.get("x-suamox-redirect-status")).toBe("302");
    expect(guardar).not.toHaveBeenCalled();
  });

  it("un RedirectResponse de la acción viaja en cabeceras", async () => {
    const { app } = createActionsApp({
      guardar: () => Promise.reject(new RedirectResponse("/ingresar", 303)),
    });

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.headers.get("x-suamox-redirect")).toBe("/ingresar");
    expect(response.headers.get("x-suamox-redirect-status")).toBe("303");
  });

  it("devolver un __redirect como dato no se toma por redirección", async () => {
    const { app } = createActionsApp({
      guardar: () => Promise.resolve({ __redirect: "https://evil.example" }),
    });

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.headers.get("x-suamox-redirect")).toBeNull();
    expect(await response.json()).toEqual({ __redirect: "https://evil.example" });
  });

  it("quita las cabeceras x-suamox-* del Response que devuelve la acción", async () => {
    const { app } = createActionsApp({
      guardar: () =>
        Promise.resolve(
          Response.json(
            { a: 1 },
            { headers: { "x-suamox-action": "1", "x-suamox-redirect": "https://evil.example" } },
          ),
        ),
    });

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.headers.get("x-suamox-action")).toBeNull();
    expect(response.headers.get("x-suamox-redirect")).toBeNull();
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("el middleware sabe qué acción se llama", async () => {
    let vista: unknown;
    const { app } = createActionsApp({ guardar: () => Promise.resolve(undefined) }, (ctx, next) => {
      vista = ctx.action;
      return next();
    });

    await post(app, { headers: sameOrigin, body: "[]" });

    expect(vista).toEqual({ file: "src/ajustes.actions.ts", name: "guardar" });
  });

  it("si el guardia deniega, el módulo no se carga ni se lee el cuerpo", async () => {
    const { app, ssrImport } = createActionsApp({ guardar: vi.fn() }, () =>
      Promise.resolve(new Response("no", { status: 401 })),
    );

    const response = await post(app, { headers: sameOrigin, body: "no es json" });

    expect(response.status).toBe(401);
    expect(ssrImport).not.toHaveBeenCalledWith("/app/src/ajustes.actions.ts");
  });

  it("la petición del contexto no describe un cuerpo que ya no tiene", async () => {
    let cabeceras: Record<string, string | null> = {};
    const { app } = createActionsApp({
      guardar: () => {
        const { request } = getActionContext();
        cabeceras = {
          length: request.headers.get("content-length"),
          type: request.headers.get("content-type"),
          cookie: request.headers.get("cookie"),
        };
        return Promise.resolve(undefined);
      },
    });

    await post(app, {
      headers: { ...sameOrigin, cookie: "sesion=1", "content-length": "2" },
      body: "[]",
    });

    expect(cabeceras).toEqual({ length: null, type: null, cookie: "sesion=1" });
  });

  it("un objeto con status y headers es un dato, no la respuesta", async () => {
    const { app } = createActionsApp({
      guardar: () => Promise.resolve({ status: 201, headers: {}, data: { id: 7 } }),
    });

    const response = await post(app, { headers: sameOrigin, body: "[]" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 201, headers: {}, data: { id: 7 } });
  });
});

describe("createProdHandler /__actions endpoint", () => {
  const createProdApp = async (entry: string) => {
    const root = await mkdtemp(join(tmpdir(), "suamox-actions-"));
    const serverDir = join(root, "dist", "server");
    const clientDir = join(root, "dist", "client");
    await mkdir(serverDir, { recursive: true });
    await mkdir(join(root, "dist", ".vite"), { recursive: true });
    await writeFile(join(serverDir, "entry-server.mjs"), entry);
    await writeFile(join(root, "dist", ".vite", "manifest.json"), "{}");

    return createProdHandler({
      root,
      clientDir,
      serverEntry: join(serverDir, "entry-server.mjs"),
      staticDir: join(root, "dist", "static"),
    });
  };

  it("carga la acción desde la tabla del server entry", async () => {
    const app = await createProdApp(
      `export const routes = [];
       export const actions = {
         "0123456789abcdef": {
           file: "src/suma.actions.ts",
           name: "sumar",
           load: () => Promise.resolve(async (a, b) => a + b),
         },
       };`,
    );

    const response = await app.request("http://localhost/__actions/0123456789abcdef", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: "[2, 3]",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toBe(5);
  });

  it("responde 404 si el build no trae acciones", async () => {
    const app = await createProdApp(`export const routes = [];`);

    const response = await app.request("http://localhost/__actions/0123456789abcdef", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: "[]",
    });

    expect(response.status).toBe(404);
  });
});

describe("createProdHandler conserva método y cuerpo", () => {
  const createProdApp = async (entry: string) => {
    const root = await mkdtemp(join(tmpdir(), "suamox-metodo-"));
    const serverDir = join(root, "dist", "server");
    await mkdir(serverDir, { recursive: true });
    await mkdir(join(root, "dist", ".vite"), { recursive: true });
    await writeFile(join(serverDir, "entry-server.mjs"), entry);
    await writeFile(join(root, "dist", ".vite", "manifest.json"), "{}");

    return createProdHandler({
      root,
      clientDir: join(root, "dist", "client"),
      serverEntry: join(serverDir, "entry-server.mjs"),
      staticDir: join(root, "dist", "static"),
    });
  };

  const matchFirst = `export const matchRoute = (routes) => ({ route: routes[0], params: {} });`;

  it("el middleware de una página ve el POST con su cuerpo, como en dev", async () => {
    const app = await createProdApp(
      `${matchFirst}
       export const routes = [{ path: "/formulario", params: [] }];
       export const onRequest = async ({ request }) =>
         Response.json({ method: request.method, body: await request.text() });`,
    );

    const response = await app.request("http://localhost/formulario", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
      body: "nombre=Ana",
    });

    expect(await response.json()).toEqual({ method: "POST", body: "nombre=Ana" });
  });

  it("un POST de otro sitio a una página se rechaza antes del middleware", async () => {
    const app = await createProdApp(
      `${matchFirst}
       export const routes = [{ path: "/formulario", params: [] }];
       export const onRequest = () => {
         globalThis.__paginaCorrio = true;
         return new Response("corrió");
       };`,
    );
    (globalThis as { __paginaCorrio?: boolean }).__paginaCorrio = false;

    const deOtroSitio = await app.request("http://localhost/formulario", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", "content-type": "text/plain" },
      body: "x",
    });
    const sinOrigen = await app.request("http://localhost/formulario", {
      method: "POST",
      body: "x",
    });

    expect(deOtroSitio.status).toBe(403);
    expect(sinOrigen.status).toBe(403);
    expect((globalThis as { __paginaCorrio?: boolean }).__paginaCorrio).toBe(false);
  });

  it("un GET de otro sitio a una página no cambia: los enlaces siguen funcionando", async () => {
    const app = await createProdApp(
      `${matchFirst}
       export const routes = [{ path: "/formulario", params: [] }];
       export const onRequest = () => new Response("ok");`,
    );

    const response = await app.request("http://localhost/formulario", {
      headers: { "sec-fetch-site": "cross-site" },
    });

    expect(response.status).toBe(200);
  });

  it("el middleware y el handler de API reciben la misma petición", async () => {
    const app = await createProdApp(
      `${matchFirst}
       export const routes = [];
       export const onRequest = ({ request, locals }, next) => {
         locals.method = request.method;
         return next();
       };
       export const apiRoutes = [{
         path: "/api/eco", params: [], isCatchAll: false, isIndex: false, priority: 0,
         methods: {
           POST: async ({ request, locals }) =>
             Response.json({ method: locals.method, body: await request.text() }),
         },
       }];`,
    );

    const response = await app.request("http://localhost/api/eco", {
      method: "POST",
      body: "hola",
    });

    expect(await response.json()).toEqual({ method: "POST", body: "hola" });
  });
});
