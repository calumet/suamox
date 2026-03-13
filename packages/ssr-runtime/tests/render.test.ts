import { createElement } from "react";
import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";

import { renderPage, useLoaderData, useStaticProps, redirect } from "../src/index";
import type { RouteRecord, LoaderContext } from "../src/index";

function createMockRoute(overrides: Partial<RouteRecord>): RouteRecord {
  return {
    path: "/",
    filePath: "/pages/index.tsx",
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    component: (() => createElement("div", { id: "root" })) as any,
    layouts: [],
    params: [],
    isCatchAll: false,
    isIndex: true,
    priority: 0,
    ...overrides,
  };
}

function createMockRequest(url: string): Request {
  return new Request(url);
}

describe("renderPage", () => {
  it("should return 404 for non-matching route", async () => {
    const routes: RouteRecord[] = [createMockRoute({ path: "/about" })];
    const request = createMockRequest("http://localhost:3000/contact");

    const result = await renderPage({
      pathname: "/contact",
      request,
      routes,
    });

    expect(result.status).toBe(404);
    expect(result.html).toContain("404");
  });

  it("should render custom 404 page when present", async () => {
    const NotFoundPage = () => createElement("div", null, "Custom 404");
    const routes: RouteRecord[] = [createMockRoute({ path: "/404", component: NotFoundPage })];
    const request = createMockRequest("http://localhost:3000/missing");

    const result = await renderPage({
      pathname: "/missing",
      request,
      routes,
    });

    expect(result.status).toBe(404);
    expect(result.html).toContain("Custom 404");
  });

  it("should return 200 for matching static route", async () => {
    const routes: RouteRecord[] = [createMockRoute({ path: "/about" })];
    const request = createMockRequest("http://localhost:3000/about");

    const result = await renderPage({
      pathname: "/about",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain('<div id="root">');
  });

  it("should execute loader and include data", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async () => ({ title: "Test Page", count: 42 }));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/test",
        loader,
      }),
    ];
    const request = createMockRequest("http://localhost:3000/test");

    const result = await renderPage({
      pathname: "/test",
      request,
      routes,
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(result.initialData).toEqual({ title: "Test Page", count: 42 });
  });

  it("should pass correct context to loader", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async (ctx: LoaderContext) => ctx);

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/blog/:slug",
        params: ["slug"],
        loader,
      }),
    ];
    const request = createMockRequest("http://localhost:3000/blog/hello?foo=bar");

    await renderPage({
      pathname: "/blog/hello",
      request,
      routes,
    });

    expect(loader).toHaveBeenCalledTimes(1);
    const context = loader.mock.calls[0]![0];

    expect(context.params).toEqual({ slug: "hello" });
    expect(context.url.pathname).toBe("/blog/hello");
    expect(context.query.get("foo")).toBe("bar");
    expect(context.request).toBe(request);
  });

  it("should return 500 if loader throws error", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async () => {
      throw new Error("Loader failed");
    });

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/error",
        loader,
      }),
    ];
    const request = createMockRequest("http://localhost:3000/error");

    const result = await renderPage({
      pathname: "/error",
      request,
      routes,
    });

    expect(result.status).toBe(500);
    expect(result.html).toContain("500");
    expect(consoleErrorSpy).toHaveBeenCalledWith("Loader error:", expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it("should handle route without loader", async () => {
    const routes: RouteRecord[] = [createMockRoute({ path: "/simple" })];
    const request = createMockRequest("http://localhost:3000/simple");

    const result = await renderPage({
      pathname: "/simple",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.initialData).toBeNull();
  });

  it("should skip SSR when csr is true", async () => {
    const loader = vi.fn();
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/csr",
        loader,
        csr: true,
      }),
    ];
    const request = createMockRequest("http://localhost:3000/csr");

    const result = await renderPage({
      pathname: "/csr",
      request,
      routes,
    });

    expect(loader).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.html).toBe("");
  });

  it("should handle dynamic routes with params", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async ({ params }: LoaderContext) => ({
      userId: params.userId,
      postId: params.postId,
    }));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/users/:userId/posts/:postId",
        params: ["userId", "postId"],
        loader,
      }),
    ];
    const request = createMockRequest("http://localhost:3000/users/123/posts/456");

    const result = await renderPage({
      pathname: "/users/123/posts/456",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.initialData).toEqual({
      userId: "123",
      postId: "456",
    });
  });

  it("should handle query parameters", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async ({ query }: LoaderContext) => ({
      search: query.get("q"),
      page: query.get("page"),
    }));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/search",
        loader,
      }),
    ];
    const request = createMockRequest("http://localhost:3000/search?q=test&page=2");

    const result = await renderPage({
      pathname: "/search",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.initialData).toEqual({
      search: "test",
      page: "2",
    });
  });

  it("should handle catch-all routes", async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async ({ params }: LoaderContext) => ({
      path: params.path,
    }));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/docs/*",
        params: ["path"],
        isCatchAll: true,
        loader,
      }),
    ];
    const request = createMockRequest("http://localhost:3000/docs/guide/intro");

    const result = await renderPage({
      pathname: "/docs/guide/intro",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.initialData).toEqual({
      path: "guide/intro",
    });
  });

  it("should render layouts around the page", async () => {
    const LayoutA = ({ children }: { children: ReactNode }) =>
      createElement("div", { id: "layout-a" }, children);
    const LayoutB = ({ children }: { children: ReactNode }) =>
      createElement("section", { id: "layout-b" }, children);
    const Page = () => createElement("main", null, "Layout Content");

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/layout",
        component: Page,
        layouts: [LayoutA, LayoutB],
      }),
    ];
    const request = createMockRequest("http://localhost:3000/layout");

    const result = await renderPage({
      pathname: "/layout",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("layout-a");
    expect(result.html).toContain("layout-b");
    expect(result.html).toContain("Layout Content");
    expect(result.html.indexOf("layout-a")).toBeLessThan(result.html.indexOf("layout-b"));
  });

  it("should handle root route", async () => {
    const routes: RouteRecord[] = [createMockRoute({ path: "/" })];
    const request = createMockRequest("http://localhost:3000/");

    const result = await renderPage({
      pathname: "/",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain('<div id="root">');
  });
});

describe("useLoaderData", () => {
  it("should provide loader data to child components via context", async () => {
    const ChildComponent = () => {
      const data = useLoaderData<{ title: string }>();
      return createElement("span", null, data.title);
    };

    const Page = () => createElement("div", null, createElement(ChildComponent));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/context",
        component: Page,
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async () => ({ title: "From Context" }),
      }),
    ];
    const request = createMockRequest("http://localhost:3000/context");

    const result = await renderPage({
      pathname: "/context",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("From Context");
  });

  it("should provide loader data through layouts", async () => {
    const ChildComponent = () => {
      const data = useLoaderData<{ message: string }>();
      return createElement("p", null, data.message);
    };

    const Layout = ({ children }: { children: ReactNode }) =>
      createElement("div", { id: "layout" }, children);

    const Page = () => createElement("main", null, createElement(ChildComponent));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/with-layout",
        component: Page,
        layouts: [Layout],
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async () => ({ message: "Through Layout" }),
      }),
    ];
    const request = createMockRequest("http://localhost:3000/with-layout");

    const result = await renderPage({
      pathname: "/with-layout",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("layout");
    expect(result.html).toContain("Through Layout");
  });

  it("should return null when no loader is defined", async () => {
    let capturedData: unknown = "not-set";

    const ChildComponent = () => {
      capturedData = useLoaderData();
      return createElement("span", null, "no data");
    };

    const Page = () => createElement("div", null, createElement(ChildComponent));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/no-loader",
        component: Page,
      }),
    ];
    const request = createMockRequest("http://localhost:3000/no-loader");

    await renderPage({ pathname: "/no-loader", request, routes });

    expect(capturedData).toBeNull();
  });

  it("should provide loader data to deeply nested components", async () => {
    const DeepChild = () => {
      const data = useLoaderData<{ items: string[] }>();
      return createElement(
        "ul",
        null,
        ...data.items.map((item) => createElement("li", { key: item }, item)),
      );
    };

    const MiddleComponent = () => createElement("section", null, createElement(DeepChild));
    const Page = () => createElement("div", null, createElement(MiddleComponent));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/deep",
        component: Page,
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async () => ({ items: ["alpha", "beta", "gamma"] }),
      }),
    ];
    const request = createMockRequest("http://localhost:3000/deep");

    const result = await renderPage({
      pathname: "/deep",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("alpha");
    expect(result.html).toContain("beta");
    expect(result.html).toContain("gamma");
  });

  it("should provide loader data in catch-all routes", async () => {
    const ChildComponent = () => {
      const data = useLoaderData<{ slug: string; content: string }>();
      return createElement("div", null, `${data.slug}: ${data.content}`);
    };

    const Page = () => createElement("article", null, createElement(ChildComponent));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/*",
        params: ["slug"],
        isCatchAll: true,
        component: Page,
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async ({ params }: LoaderContext) => ({
          slug: params.slug,
          content: `Content for ${params.slug}`,
        }),
      }),
    ];
    const request = createMockRequest("http://localhost:3000/docs/getting-started");

    const result = await renderPage({
      pathname: "/docs/getting-started",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("docs/getting-started");
    expect(result.html).toContain("Content for docs/getting-started");
  });

  it("should provide loader data in nested dynamic + catch-all routes like /[lang]/contenido/[...slug]", async () => {
    const Breadcrumb = () => {
      const data = useLoaderData<{ lang: string; slug: string }>();
      return createElement("nav", null, `${data.lang} > ${data.slug}`);
    };

    const PageContent = () => {
      const data = useLoaderData<{ lang: string; slug: string; title: string }>();
      return createElement("h1", null, data.title);
    };

    const Page = () =>
      createElement("div", null, createElement(Breadcrumb), createElement(PageContent));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/:lang/contenido/*",
        params: ["lang", "slug"],
        isCatchAll: true,
        component: Page,
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async ({ params }: LoaderContext) => ({
          lang: params.lang,
          slug: params.slug,
          title: `Página: ${params.slug} (${params.lang})`,
        }),
      }),
    ];
    const request = createMockRequest("http://localhost:3000/es/contenido/guias/inicio");

    const result = await renderPage({
      pathname: "/es/contenido/guias/inicio",
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("es &gt; guias/inicio");
    expect(result.html).toContain("Página: guias/inicio (es)");
  });

  it("should provide static props via useStaticProps when props are passed", async () => {
    const Page = () => {
      const props = useStaticProps<{ title: string }>();
      const data = useLoaderData<{ lang: string }>();
      return createElement("div", null, `${data.lang}: ${props.title}`);
    };

    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/:lang/contenido/*",
        params: ["lang", "slug"],
        isCatchAll: true,
        component: Page,
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async ({ params }: LoaderContext) => ({
          lang: params.lang,
        }),
      }),
    ];
    const request = createMockRequest("http://localhost:3000/es/contenido/mision");

    const result = await renderPage({
      pathname: "/es/contenido/mision",
      request,
      routes,
      props: { title: "Nuestra Misión" },
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain("es: Nuestra Misión");
  });

  it("should throw error when useStaticProps is called on the client", () => {
    const originalWindow = globalThis.window;
    // Simular entorno de cliente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    globalThis.window = {} as any;

    try {
      expect(() => useStaticProps()).toThrow(
        "useStaticProps() is server-only. Use useLoaderData() on the client instead.",
      );
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      globalThis.window = originalWindow as any;
    }
  });
});

describe("redirect", () => {
  it("should return a redirect result with default 302 status", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/old",
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async () => {
          redirect("/new");
        },
      }),
    ];
    const request = createMockRequest("http://localhost:3000/old");

    const result = await renderPage({ pathname: "/old", request, routes });

    expect(result.status).toBe(302);
    expect(result.redirectTo).toBe("/new");
    expect(result.html).toBe("");
  });

  it("should support custom redirect status codes", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/moved",
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async () => {
          redirect("/permanent", 301);
        },
      }),
    ];
    const request = createMockRequest("http://localhost:3000/moved");

    const result = await renderPage({ pathname: "/moved", request, routes });

    expect(result.status).toBe(301);
    expect(result.redirectTo).toBe("/permanent");
  });

  it("should redirect conditionally based on params", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/:lang",
        params: ["lang"],
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async ({ params }: LoaderContext) => {
          if (params.lang === "old") {
            redirect("/es", 301);
          }
          return { lang: params.lang };
        },
      }),
    ];

    const redirectResult = await renderPage({
      pathname: "/old",
      request: createMockRequest("http://localhost:3000/old"),
      routes,
    });
    expect(redirectResult.status).toBe(301);
    expect(redirectResult.redirectTo).toBe("/es");

    const normalResult = await renderPage({
      pathname: "/es",
      request: createMockRequest("http://localhost:3000/es"),
      routes,
    });
    expect(normalResult.status).toBe(200);
    expect(normalResult.redirectTo).toBeUndefined();
  });

  it("should redirect to external URLs", async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: "/external",
        // eslint-disable-next-line @typescript-eslint/require-await
        loader: async () => {
          redirect("https://example.com");
        },
      }),
    ];
    const request = createMockRequest("http://localhost:3000/external");

    const result = await renderPage({ pathname: "/external", request, routes });

    expect(result.status).toBe(302);
    expect(result.redirectTo).toBe("https://example.com");
  });
});
