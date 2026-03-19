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
