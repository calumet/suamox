import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createElement } from "react";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import type { RouteRecord } from "../src/index";
import { prerender } from "../src/ssg";

function createMockRoute(overrides: Partial<RouteRecord>): RouteRecord {
  return {
    path: "/",
    filePath: "/pages/index.tsx",
    component: (() => createElement("div", null, "Home")) as RouteRecord["component"],
    layouts: [],
    params: [],
    isCatchAll: false,
    isIndex: true,
    priority: 0,
    ...overrides,
  };
}

describe("prerender", () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), "suamox-prerender-"));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("writes static and dynamic routes", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/",
        prerender: true,
        component: (() => createElement("div", null, "Home")) as RouteRecord["component"],
      }),
      createMockRoute({
        path: "/blog/:slug",
        params: ["slug"],
        isIndex: false,
        prerender: true,
        getStaticPaths: () => Promise.resolve([{ params: { slug: "hello-world" } }]),
        loader: ({ params }) => Promise.resolve({ slug: params.slug }),
        component: (({ data }: { data: { slug: string } }) =>
          createElement("div", null, `Post ${data.slug}`)) as RouteRecord["component"],
      }),
    ];

    await prerender({
      routes,
      outDir,
      baseUrl: "http://localhost",
    });

    const indexHtml = await readFile(join(outDir, "index.html"), "utf-8");
    expect(indexHtml).toContain("Home");
    expect(indexHtml).not.toContain("window.__INITIAL_DATA__");
    expect(indexHtml).not.toContain('<script type="module"');

    const blogHtml = await readFile(join(outDir, "blog", "hello-world", "index.html"), "utf-8");
    expect(blogHtml).toContain("Post hello-world");
  });

  it("renders catch-all static paths", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/docs/*",
        params: ["path"],
        isCatchAll: true,
        isIndex: false,
        prerender: true,
        getStaticPaths: () => Promise.resolve([{ params: { path: "guide/getting-started" } }]),
        loader: ({ params }) => Promise.resolve({ path: params.path }),
        component: (({ data }: { data: { path: string } }) =>
          createElement("div", null, `Doc ${data.path}`)) as RouteRecord["component"],
      }),
    ];

    await prerender({
      routes,
      outDir,
      baseUrl: "http://localhost",
    });

    const docHtml = await readFile(
      join(outDir, "docs", "guide", "getting-started", "index.html"),
      "utf-8",
    );

    expect(docHtml).toContain("Doc guide/getting-started");
  });

  it("passes static props from getStaticPaths to useStaticProps", async () => {
    const { useStaticProps } = await import("../src/index");

    const ContentPage = (() => {
      const props = useStaticProps<{ title: string }>();
      return createElement("div", null, `Title: ${props.title}`);
    }) as RouteRecord["component"];

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/:lang/contenido/*",
        params: ["lang", "slug"],
        isCatchAll: true,
        isIndex: false,
        prerender: true,
        getStaticPaths: () =>
          Promise.resolve([
            {
              params: { lang: "es", slug: "quienes-somos" },
              props: { title: "Quiénes Somos" },
            },
          ]),
        loader: ({ params }) => Promise.resolve({ lang: params.lang }),
        component: ContentPage,
      }),
    ];

    await prerender({
      routes,
      outDir,
      baseUrl: "http://localhost",
    });

    const html = await readFile(
      join(outDir, "es", "contenido", "quienes-somos", "index.html"),
      "utf-8",
    );

    expect(html).toContain("Title: Quiénes Somos");
  });

  it("outputs files under base path", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/",
        prerender: true,
        component: (() => createElement("div", null, "Home")) as RouteRecord["component"],
      }),
      createMockRoute({
        path: "/about",
        isIndex: false,
        prerender: true,
        component: (() => createElement("div", null, "About")) as RouteRecord["component"],
      }),
    ];

    await prerender({
      routes,
      outDir,
      baseUrl: "http://localhost",
      base: "/app",
    });

    const indexHtml = await readFile(join(outDir, "app", "index.html"), "utf-8");
    expect(indexHtml).toContain("Home");

    const aboutHtml = await readFile(join(outDir, "app", "about", "index.html"), "utf-8");
    expect(aboutHtml).toContain("About");
  });

  it("outputs dynamic routes under base path", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/blog/:slug",
        params: ["slug"],
        isIndex: false,
        prerender: true,
        getStaticPaths: () => Promise.resolve([{ params: { slug: "first" } }]),
        loader: ({ params }) => Promise.resolve({ slug: params.slug }),
        component: (({ data }: { data: { slug: string } }) =>
          createElement("div", null, `Post ${data.slug}`)) as RouteRecord["component"],
      }),
    ];

    await prerender({
      routes,
      outDir,
      baseUrl: "http://localhost",
      base: "/blog-app",
    });

    const html = await readFile(join(outDir, "blog-app", "blog", "first", "index.html"), "utf-8");
    expect(html).toContain("Post first");
  });

  it("outputs files at root when base is /", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/",
        prerender: true,
        component: (() => createElement("div", null, "Root")) as RouteRecord["component"],
      }),
    ];

    await prerender({
      routes,
      outDir,
      baseUrl: "http://localhost",
      base: "/",
    });

    const html = await readFile(join(outDir, "index.html"), "utf-8");
    expect(html).toContain("Root");
  });

  it("injects stylesheet links from resolved assets", async () => {
    const route = createMockRoute({
      path: "/",
      prerender: true,
      component: (() => createElement("div", null, "Home")) as RouteRecord["component"],
    });

    await prerender({
      routes: [route],
      outDir,
      baseUrl: "http://localhost",
      resolveAssets: () => ({
        styles: ["/client/assets/app.css"],
      }),
    });

    const indexHtml = await readFile(join(outDir, "index.html"), "utf-8");
    expect(indexHtml).toContain('<link rel="stylesheet" href="/client/assets/app.css">');
  });
});
