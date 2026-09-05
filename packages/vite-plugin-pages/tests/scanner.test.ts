import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { scanRoutes } from "../src/scanner";

const writeFileWithDirs = async (filePath: string, contents: string): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
};

const normalizePath = (value: string): string => value.replace(/\\/g, "/");

const normalizeList = (values: string[] | undefined): string[] => (values ?? []).map(normalizePath);

describe("scanRoutes layouts", () => {
  it("collects layouts from root to leaf and skips layout files as routes", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    const rootLayout = join(pagesDir, "layout.tsx");
    const blogLayout = join(pagesDir, "blog", "layout.tsx");
    const adminLayout = join(pagesDir, "(admin)", "layout.tsx");

    const rootPage = join(pagesDir, "index.tsx");
    const blogIndex = join(pagesDir, "blog", "index.tsx");
    const dashboard = join(pagesDir, "(admin)", "dashboard.tsx");

    await writeFileWithDirs(
      rootLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(
      blogLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(
      adminLayout,
      "export default function Layout({ children }) { return children; }",
    );

    await writeFileWithDirs(rootPage, "export default function Page() { return null; }");
    await writeFileWithDirs(blogIndex, "export default function Page() { return null; }");
    await writeFileWithDirs(dashboard, "export default function Page() { return null; }");

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx"],
      root,
    });

    const findRoute = (path: string) => result.routes.find((route) => route.path === path);
    const rootRoute = findRoute("/");
    const blogRoute = findRoute("/blog");
    const adminRoute = findRoute("/dashboard");

    expect(normalizeList(rootRoute?.layouts)).toEqual([rootLayout].map(normalizePath));
    expect(normalizeList(blogRoute?.layouts)).toEqual([rootLayout, blogLayout].map(normalizePath));
    expect(normalizeList(adminRoute?.layouts)).toEqual(
      [rootLayout, adminLayout].map(normalizePath),
    );

    const routeFiles = result.routes.map((route) => route.filePath);
    expect(routeFiles).not.toContain(rootLayout);
    expect(routeFiles).not.toContain(blogLayout);
    expect(routeFiles).not.toContain(adminLayout);
  });

  it("detects layout loaders and populates layoutMetas with routeIds", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    const rootLayout = join(pagesDir, "layout.tsx");
    const langLayout = join(pagesDir, "[lang]", "layout.tsx");
    const page = join(pagesDir, "[lang]", "index.tsx");

    await writeFileWithDirs(
      rootLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(
      langLayout,
      `export function loader() { return { info: 'test' }; }
export default function Layout({ children }) { return children; }`,
    );
    await writeFileWithDirs(page, "export default function Page() { return null; }");

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx"],
      root,
    });

    const route = result.routes.find((r) => r.path === "/:lang");
    expect(route).toBeDefined();
    expect(route?.layoutMetas).toHaveLength(2);
    expect(route?.layoutMetas?.[0]?.routeId).toBe("layout:root");
    expect(route?.layoutMetas?.[0]?.hasLoader).toBe(false);
    expect(route?.layoutMetas?.[1]?.routeId).toBe("layout:[lang]");
    expect(route?.layoutMetas?.[1]?.hasLoader).toBe(true);
  });

  it("skips the layout chain for a page that exports layout = false", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    const rootLayout = join(pagesDir, "layout.tsx");
    const portalLayout = join(pagesDir, "portal", "layout.tsx");
    const conLayout = join(pagesDir, "portal", "index.tsx");
    const sinLayout = join(pagesDir, "portal", "ingresar.tsx");

    await writeFileWithDirs(
      rootLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(
      portalLayout,
      `export function loader() { return { info: 'test' }; }
export default function Layout({ children }) { return children; }`,
    );
    await writeFileWithDirs(conLayout, "export default function Page() { return null; }");
    await writeFileWithDirs(
      sinLayout,
      `export const layout = false;
export default function Page() { return null; }`,
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx"],
      root,
    });

    const findRoute = (path: string) => result.routes.find((route) => route.path === path);

    // La hermana de la misma carpeta conserva la cadena entera
    expect(normalizeList(findRoute("/portal")?.layouts)).toEqual(
      [rootLayout, portalLayout].map(normalizePath),
    );

    const ingresar = findRoute("/portal/ingresar");
    expect(ingresar?.layouts).toEqual([]);
    expect(ingresar?.layoutMetas).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("puts src/pages/root.tsx first in the chain and keeps it out of the routes", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    const appRoot = join(pagesDir, "root.tsx");
    const rootLayout = join(pagesDir, "layout.tsx");
    const blogLayout = join(pagesDir, "blog", "layout.tsx");

    await writeFileWithDirs(
      appRoot,
      "export default function Root({ children }) { return children; }",
    );
    await writeFileWithDirs(
      rootLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(
      blogLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(join(pagesDir, "blog", "index.tsx"), "export default function P() {}");

    const result = await scanRoutes({ pagesDir: "src/pages", extensions: [".tsx"], root });

    expect(result.routes.map((route) => route.path)).toEqual(["/blog"]);
    expect(normalizeList(result.routes[0]?.layouts)).toEqual(
      [appRoot, rootLayout, blogLayout].map(normalizePath),
    );
    expect(result.routes[0]?.layoutMetas?.[0]?.routeId).toBe("root");
  });

  it("keeps root.tsx on a page that exports layout = false", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    const appRoot = join(pagesDir, "root.tsx");
    const rootLayout = join(pagesDir, "layout.tsx");

    await writeFileWithDirs(
      appRoot,
      `export function loader() { return { lang: "es" }; }
export default function Root({ children }) { return children; }`,
    );
    await writeFileWithDirs(
      rootLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(
      join(pagesDir, "ingresar.tsx"),
      `export const layout = false;
export default function P() {}`,
    );

    const result = await scanRoutes({ pagesDir: "src/pages", extensions: [".tsx"], root });
    const ingresar = result.routes.find((route) => route.path === "/ingresar");

    expect(normalizeList(ingresar?.layouts)).toEqual([appRoot].map(normalizePath));
    expect(ingresar?.layoutMetas).toEqual([
      { filePath: appRoot, routeId: "root", hasLoader: true },
    ]);
  });

  it("treats a nested root.tsx as an ordinary page", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    await writeFileWithDirs(join(pagesDir, "blog", "root.tsx"), "export default function P() {}");

    const result = await scanRoutes({ pagesDir: "src/pages", extensions: [".tsx"], root });

    expect(result.routes.map((route) => route.path)).toEqual(["/blog/root"]);
    expect(result.routes[0]?.layouts).toEqual([]);
  });

  it("does not skip layouts when layout is exported as true", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    const rootLayout = join(pagesDir, "layout.tsx");
    const page = join(pagesDir, "index.tsx");

    await writeFileWithDirs(
      rootLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(
      page,
      `export const layout = true;
export default function Page() { return null; }`,
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx"],
      root,
    });

    expect(normalizeList(result.routes.find((route) => route.path === "/")?.layouts)).toEqual(
      [rootLayout].map(normalizePath),
    );
  });

  it("does not treat layout = false in a comment or string as the flag", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    const rootLayout = join(pagesDir, "layout.tsx");
    const page = join(pagesDir, "index.tsx");

    await writeFileWithDirs(
      rootLayout,
      "export default function Layout({ children }) { return children; }",
    );
    await writeFileWithDirs(
      page,
      `// export const layout = false;
const nota = "export const layout = false";
export default function Page() { return nota; }`,
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx"],
      root,
    });

    expect(normalizeList(result.routes.find((route) => route.path === "/")?.layouts)).toEqual(
      [rootLayout].map(normalizePath),
    );
  });

  it("detects loader, getStaticPaths and prerender exports in tsx pages", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");
    const blogPage = join(pagesDir, "blog", "[slug].tsx");

    await writeFileWithDirs(
      blogPage,
      `export const prerender: boolean = true;
export async function getStaticPaths(): Promise<Array<{ params: { slug: string } }>> {
  return [{ params: { slug: 'hello' } }];
}
export const loader = async (ctx: { params: { slug: string } }) => ({ slug: ctx.params.slug });
export default function Page() {
  return null;
}
`,
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx"],
      root,
    });

    const route = result.routes.find((item) => item.path === "/blog/:slug");
    expect(route).toBeDefined();
    expect(route?.hasLoader).toBe(true);
    expect(route?.hasGetStaticPaths).toBe(true);
    expect(route?.hasPrerender).toBe(true);
  });

  it("does not treat loader in comments or strings as a real export (AST, not regex)", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");
    const page = join(pagesDir, "trap.tsx");

    await writeFileWithDirs(
      page,
      `// export function loader() { return null; }
const docs = "export const getStaticPaths = () => []";
export default function Page() {
  return null;
}
`,
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx"],
      root,
    });

    const route = result.routes.find((item) => item.path === "/trap");
    expect(route).toBeDefined();
    expect(route?.hasLoader).toBe(false);
    expect(route?.hasGetStaticPaths).toBe(false);
  });
});

describe("scanRoutes middleware detection", () => {
  it("detects src/middleware.ts when present", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    await writeFileWithDirs(
      join(pagesDir, "index.tsx"),
      "export default function Page() { return null; }",
    );
    await writeFileWithDirs(
      join(root, "src", "middleware.ts"),
      "export function onRequest(ctx, next) { return next(); }",
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
      root,
    });

    expect(result.hasMiddleware).toBe(true);
  });

  it("detects src/middleware/index.ts when present", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    await writeFileWithDirs(
      join(pagesDir, "index.tsx"),
      "export default function Page() { return null; }",
    );
    await writeFileWithDirs(
      join(root, "src", "middleware", "index.ts"),
      "export function onRequest(ctx, next) { return next(); }",
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
      root,
    });

    expect(result.hasMiddleware).toBe(true);
  });

  it("returns hasMiddleware false when no middleware file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    await writeFileWithDirs(
      join(pagesDir, "index.tsx"),
      "export default function Page() { return null; }",
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
      root,
    });

    expect(result.hasMiddleware).toBe(false);
  });
});

describe("API route scanning", () => {
  it("detects API routes in src/api/ directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");
    const apiDir = join(root, "src", "api");

    await writeFileWithDirs(
      join(pagesDir, "index.tsx"),
      "export default function Page() { return null; }",
    );
    await writeFileWithDirs(
      join(apiDir, "health.ts"),
      "export function GET() { return new Response('ok'); }",
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
      root,
    });

    expect(result.apiRoutes).toHaveLength(1);
    expect(result.apiRoutes[0].type).toBe("api");
    expect(normalizePath(result.apiRoutes[0].filePath)).toBe(
      normalizePath(join(apiDir, "health.ts")),
    );
  });

  it("detects HTTP methods (GET, POST, DELETE) from exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");
    const apiDir = join(root, "src", "api");

    await writeFileWithDirs(
      join(pagesDir, "index.tsx"),
      "export default function Page() { return null; }",
    );
    await writeFileWithDirs(
      join(apiDir, "users.ts"),
      `export function GET() { return new Response('list'); }
export function POST() { return new Response('create'); }
export function DELETE() { return new Response('remove'); }`,
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
      root,
    });

    const usersRoute = result.apiRoutes.find((r) => r.path === "/api/users");
    expect(usersRoute).toBeDefined();
    expect(usersRoute!.httpMethods).toContain("GET");
    expect(usersRoute!.httpMethods).toContain("POST");
    expect(usersRoute!.httpMethods).toContain("DELETE");
    expect(usersRoute!.httpMethods).not.toContain("PUT");
  });

  it("prefixes API routes with /api", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");
    const apiDir = join(root, "src", "api");

    await writeFileWithDirs(
      join(pagesDir, "index.tsx"),
      "export default function Page() { return null; }",
    );
    await writeFileWithDirs(
      join(apiDir, "index.ts"),
      "export function GET() { return new Response('root'); }",
    );
    await writeFileWithDirs(
      join(apiDir, "items.ts"),
      "export function GET() { return new Response('items'); }",
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
      root,
    });

    const paths = result.apiRoutes.map((r) => r.path);
    expect(paths).toContain("/api");
    expect(paths).toContain("/api/items");
  });

  it("returns empty apiRoutes when src/api/ does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-pages-"));
    const pagesDir = join(root, "src", "pages");

    await writeFileWithDirs(
      join(pagesDir, "index.tsx"),
      "export default function Page() { return null; }",
    );

    const result = await scanRoutes({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
      root,
    });

    expect(result.apiRoutes).toEqual([]);
  });
});
