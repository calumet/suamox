import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RenderOptions, RenderResult } from "@calumet/suamox";
import type { ViteDevServer } from "vite";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  };
});

import { createDevHandler, createHonoApp, createProdHandler } from "../src/index";

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
    const ssrLoadModule = vi.fn((_id: string) => Promise.resolve({ routes }));
    const transformIndexHtml = vi.fn((_url: string, html: string) => Promise.resolve(html));
    const vite = {
      ssrLoadModule,
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
    const ssrLoadModule = vi.fn((_id: string) => Promise.resolve({ routes: [] }));

    const vite = {
      ssrLoadModule,
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
      ssrLoadModule: vi.fn(() => Promise.resolve({ routes: [] })),
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
      ssrLoadModule: vi.fn(() => Promise.resolve({ routes: [] })),
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
      ssrLoadModule: vi.fn(() => Promise.resolve({ routes: [route] })),
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
      ssrLoadModule: vi.fn(() => Promise.resolve({ routes: [route] })),
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
