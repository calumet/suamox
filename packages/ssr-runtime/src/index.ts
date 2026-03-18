import {
  HeadProvider,
  createHeadManager,
  headMarkerAttribute,
  headMarkerEndValue,
  headMarkerStartValue,
} from "@calumet/suamox-head";
import type React from "react";
import { createContext, createElement, Fragment, useContext } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";

export interface LayoutInfo {
  component: React.ComponentType<{ children: React.ReactNode }>;
  loader?: (ctx: LoaderContext) => Promise<unknown>;
  routeId: string;
  hasLoader?: boolean;
}

export interface RouteRecord {
  path: string;
  filePath: string;
  component?: React.ComponentType<PageProps>;
  load?: RouteModuleLoader;
  layouts?: Array<React.ComponentType<{ children: React.ReactNode }>>;
  layoutInfos?: LayoutInfo[];
  getStaticPaths?: GetStaticPaths;
  prerender?: boolean;
  csr?: boolean;
  params: string[];
  isCatchAll: boolean;
  isIndex: boolean;
  priority: number;
  loader?: (ctx: LoaderContext) => Promise<unknown>;
  hasLoader?: boolean;
  hasLayoutLoaders?: boolean;
  layoutRouteIds?: string[];
}

export interface LoaderContext {
  request: Request;
  url: URL;
  params: Record<string, string>;
  query: URLSearchParams;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PageProps<T = any> {
  data: T;
}

export interface StaticPathEntry {
  params: Record<string, string>;
  props?: Record<string, unknown>;
}

export type GetStaticPaths = () => Promise<StaticPathEntry[]>;

export interface RouteModule {
  component: React.ComponentType<PageProps>;
  layouts?: Array<React.ComponentType<{ children: React.ReactNode }>>;
  layoutInfos?: LayoutInfo[];
  loader?: (ctx: LoaderContext) => Promise<unknown>;
  getStaticPaths?: GetStaticPaths;
  prerender?: boolean;
  csr?: boolean;
}

export type RouteModuleLoader = () => Promise<RouteModule>;

const LoaderDataContext = createContext<unknown>(null);
const StaticPropsContext = createContext<Record<string, unknown>>({});
const AllRouteDataContext = createContext<Record<string, unknown>>({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useLoaderData<T = any>(): T {
  return useContext(LoaderDataContext) as T;
}

export function useRouteLoaderData<T = unknown>(routeId: string): T | undefined {
  const allData = useContext(AllRouteDataContext);
  return allData[routeId] as T | undefined;
}

export function useStaticProps<T = Record<string, unknown>>(): T {
  if (typeof window !== "undefined") {
    throw new Error("useStaticProps() is server-only. Use useLoaderData() on the client instead.");
  }
  return useContext(StaticPropsContext) as T;
}

export function stripBase(pathname: string, base: string): string {
  if (base === "/" || base === "") return pathname;
  if (pathname.startsWith(base)) {
    const stripped = pathname.slice(base.length);
    return stripped === "" ? "/" : stripped;
  }
  return pathname;
}

export class RedirectResponse extends Error {
  readonly location: string;
  readonly status: number;

  constructor(location: string, status: number = 302) {
    super(`Redirect to ${location}`);
    this.name = "RedirectResponse";
    this.location = location;
    this.status = status;
  }
}

export function redirect(location: string, status: number = 302): never {
  throw new RedirectResponse(location, status);
}

export interface MatchResult {
  route: RouteRecord;
  params: Record<string, string>;
}

export interface RenderOptions {
  pathname: string;
  request: Request;
  routes: RouteRecord[];
  props?: Record<string, unknown>;
}

export interface RenderResult {
  status: number;
  html: string;
  head?: string;
  initialData?: unknown;
  layoutData?: Record<string, unknown>;
  redirectTo?: string;
}

export interface HydrationAdapter {
  hydrateRoot: typeof import("react-dom/client").hydrateRoot;
  createRoot: typeof import("react-dom/client").createRoot;
}

const renderHeadToString = (nodes: React.ReactNode[]): string => {
  const startTag = `<meta ${headMarkerAttribute}="${headMarkerStartValue}">`;
  const endTag = `<meta ${headMarkerAttribute}="${headMarkerEndValue}">`;
  const content = nodes
    .map((node) => renderToStaticMarkup(createElement(Fragment, null, node)))
    .join("\n");

  return [startTag, content, endTag].filter(Boolean).join("\n");
};

/**
 * Hace match de un pathname contra rutas y extrae params
 */
export function matchRoute(routes: RouteRecord[], pathname: string): MatchResult | null {
  // Normalizar pathname
  const normalizedPath = pathname === "" ? "/" : pathname;

  for (const route of routes) {
    const match = matchPattern(route, normalizedPath);
    if (match) {
      return {
        route,
        params: match.params,
      };
    }
  }

  return null;
}

/**
 * Hace match de un patrón de ruta contra un pathname
 */
function matchPattern(
  route: RouteRecord,
  pathname: string,
): { params: Record<string, string> } | null {
  const pattern = route.path;
  // Manejar match exacto para rutas estáticas
  if (!pattern.includes(":") && !pattern.includes("*")) {
    return pattern === pathname ? { params: {} } : null;
  }

  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  // Ruta catch-all
  if (pattern.endsWith("/*")) {
    const basePattern = pattern.slice(0, -2);
    const baseParts = basePattern.split("/").filter(Boolean);

    const params: Record<string, string> = {};

    // Verificar si coincide la base y extraer params dinámicos
    for (let i = 0; i < baseParts.length; i++) {
      const patternPart = baseParts[i];
      const pathPart = pathParts[i];

      if (!patternPart || !pathPart) {
        return null;
      }

      if (patternPart.startsWith(":")) {
        params[patternPart.slice(1)] = pathPart;
        continue;
      }

      if (patternPart !== pathPart) {
        return null;
      }
    }

    // Extraer parámetro catch-all
    const catchAllParts = pathParts.slice(baseParts.length);
    const catchAllParamName = route.params[route.params.length - 1] ?? "all";
    params[catchAllParamName] = catchAllParts.join("/");

    return { params };
  }

  // Match de rutas dinámicas
  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]!;
    const pathPart = pathParts[i]!;

    if (patternPart.startsWith(":")) {
      // Parámetro dinámico
      const paramName = patternPart.slice(1);
      params[paramName] = pathPart;
    } else if (patternPart !== pathPart) {
      // La parte estática no coincide
      return null;
    }
  }

  return { params };
}

export function createPageElement(
  route: RouteRecord,
  data: unknown,
  staticProps?: Record<string, unknown>,
  layoutData?: Record<string, unknown>,
): React.ReactElement {
  if (!route.component) {
    throw new Error(`Route component not resolved for ${route.path}`);
  }
  const pageElement = createElement(route.component, { data });
  const layoutInfos = route.layoutInfos;

  let tree: React.ReactElement;

  if (layoutInfos && layoutInfos.length > 0 && layoutData) {
    // Cada layout tiene su propio LoaderDataContext.Provider
    tree = layoutInfos.reduceRight<React.ReactElement>(
      (child, info) => {
        const layoutElement = createElement(info.component, null, child);
        const thisData = layoutData[info.routeId];
        if (thisData !== undefined) {
          return createElement(LoaderDataContext.Provider, { value: thisData }, layoutElement);
        }
        return layoutElement;
      },
      // La pagina queda envuelta con su propio provider
      createElement(LoaderDataContext.Provider, { value: data }, pageElement),
    );
  } else {
    // Legacy: un solo provider para todo
    const layouts = route.layouts ?? [];
    const withLayouts =
      layouts.length === 0
        ? pageElement
        : layouts.reduceRight<React.ReactElement>(
            (child, Layout) => createElement(Layout, null, child),
            pageElement,
          );
    tree = createElement(LoaderDataContext.Provider, { value: data }, withLayouts);
  }

  // Construir mapa completo de route data para useRouteLoaderData
  const allRouteData: Record<string, unknown> = {};
  if (layoutData) {
    Object.assign(allRouteData, layoutData);
  }
  if (data !== null && data !== undefined) {
    allRouteData[route.path] = data;
  }
  tree = createElement(AllRouteDataContext.Provider, { value: allRouteData }, tree);

  if (staticProps) {
    return createElement(StaticPropsContext.Provider, { value: staticProps }, tree);
  }

  return tree;
}

export async function resolveRouteModule(route: RouteRecord): Promise<RouteRecord> {
  if (route.component) {
    return route;
  }

  if (!route.load) {
    return route;
  }

  const loaded = await route.load();
  route.component = loaded.component;
  route.layouts = loaded.layouts ?? [];
  route.layoutInfos = loaded.layoutInfos;
  route.loader = loaded.loader;
  route.getStaticPaths = loaded.getStaticPaths;
  route.prerender = loaded.prerender === true;
  route.csr = loaded.csr === true;

  return route;
}

export async function hydrateApp(
  routes: RouteRecord[],
  adapter?: HydrationAdapter,
  base: string = "/",
): Promise<void> {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    return;
  }

  const match = matchRoute(routes, stripBase(window.location.pathname, base));
  if (!match) {
    return;
  }

  const rawInitialData =
    (window as Window & { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__ ?? null;
  const resolvedRoute = await resolveRouteModule(match.route);

  let initialData: unknown = null;
  let layoutData: Record<string, unknown> | undefined;

  if (
    rawInitialData &&
    typeof rawInitialData === "object" &&
    "page" in (rawInitialData as Record<string, unknown>)
  ) {
    const structured = rawInitialData as { page: unknown; layouts: Record<string, unknown> };
    initialData = structured.page;
    layoutData = structured.layouts;
  } else {
    initialData = rawInitialData;
  }

  const pageElement = createPageElement(resolvedRoute, initialData, undefined, layoutData);
  const element = createElement(HeadProvider, null, pageElement);

  let hydrateRoot = adapter?.hydrateRoot;
  let createRoot = adapter?.createRoot;
  if (!hydrateRoot || !createRoot) {
    const client = await import("react-dom/client");
    hydrateRoot = client.hydrateRoot;
    createRoot = client.createRoot;
  }

  if (resolvedRoute.csr) {
    createRoot(rootElement).render(element);
    return;
  }

  hydrateRoot(rootElement, element);
}

/**
 * Renderiza una página con SSR
 */
export async function renderPage(options: RenderOptions): Promise<RenderResult> {
  const { pathname, request, routes, props = {} } = options;

  // Hacer match de ruta
  const match = matchRoute(routes, pathname);
  const notFoundRoute = routes.find((route) => route.path === "/404");

  if (!match && !notFoundRoute) {
    return {
      status: 404,
      html: "<h1>404 - Page Not Found</h1>",
    };
  }

  const resolvedMatch = match ?? { route: notFoundRoute!, params: {} };
  const { route, params } = resolvedMatch;
  const status = !match || route.path === "/404" ? 404 : 200;
  const resolvedRoute = await resolveRouteModule(route);
  const url = new URL(request.url);

  if (resolvedRoute.csr) {
    return {
      status,
      html: "",
      head: renderHeadToString([]),
      initialData: null,
    };
  }

  // Construir contexto del loader
  const loaderContext: LoaderContext = {
    request,
    url,
    params,
    query: url.searchParams,
  };

  // Ejecutar layout loaders secuencialmente
  let layoutData: Record<string, unknown> | undefined;
  const layoutInfos = resolvedRoute.layoutInfos;
  if (layoutInfos && layoutInfos.some((li) => li.loader)) {
    layoutData = {};
    for (const info of layoutInfos) {
      if (info.loader) {
        try {
          layoutData[info.routeId] = await info.loader(loaderContext);
        } catch (error) {
          if (error instanceof RedirectResponse) {
            return {
              status: error.status,
              html: "",
              redirectTo: error.location,
            };
          }
          console.error("Layout loader error:", error);
          return {
            status: 500,
            html: "<h1>500 - Internal Server Error</h1>",
          };
        }
      }
    }
  }

  // Ejecutar page loader si existe
  let data: unknown = null;
  if (resolvedRoute.loader) {
    try {
      data = await resolvedRoute.loader(loaderContext);
    } catch (error) {
      if (error instanceof RedirectResponse) {
        return {
          status: error.status,
          html: "",
          redirectTo: error.location,
        };
      }
      console.error("Loader error:", error);
      return {
        status: 500,
        html: "<h1>500 - Internal Server Error</h1>",
      };
    }
  }

  // Renderizar componente con React SSR
  try {
    const headManager = createHeadManager("server");
    const element = createElement(
      HeadProvider,
      { manager: headManager },
      createPageElement(resolvedRoute, data, props, layoutData),
    );
    const html = renderToString(element);
    const head = renderHeadToString(headManager.getSnapshot());

    return {
      status,
      html,
      head,
      initialData: data,
      layoutData,
    };
  } catch (error) {
    console.error("Render error:", error);
    return {
      status: 500,
      html: "<h1>500 - Internal Server Error</h1>",
    };
  }
}

/**
 * Serializa datos de forma segura para inyección en HTML
 */
export function serializeData(data: unknown): string {
  const json = JSON.stringify(data) ?? "null";
  // Escapar entidades HTML para prevenir XSS
  // Solo se escapan <, > y & que pueden romper el contexto del script
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/**
 * Genera la plantilla HTML con datos iniciales
 */
export function generateHTML(options: {
  html: string;
  head?: string;
  initialData?: unknown;
  scripts?: string[];
  preloadScripts?: string[];
  styles?: string[];
  includeInitialDataScript?: boolean;
  scriptPlacement?: "head" | "body";
}): string {
  const {
    html,
    head = "",
    initialData,
    scripts = [],
    preloadScripts = [],
    styles = [],
    includeInitialDataScript = true,
    scriptPlacement = "body",
  } = options;

  const uniqueStyles = Array.from(new Set(styles));
  const uniquePreloadScripts = Array.from(new Set(preloadScripts));
  const uniqueScripts = Array.from(new Set(scripts));

  const styleTags = uniqueStyles
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n    ");

  const preloadTags = uniquePreloadScripts
    .map((href) => `<link rel="modulepreload" href="${href}">`)
    .join("\n    ");

  const scriptTags = uniqueScripts
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join("\n    ");

  const dataScript = includeInitialDataScript
    ? `<script>
      window.__INITIAL_DATA__ = ${initialData !== undefined ? serializeData(initialData) : "null"};
    </script>`
    : "";

  const headContent = [head, styleTags, preloadTags, scriptPlacement === "head" ? scriptTags : ""]
    .filter(Boolean)
    .join("\n    ");
  const bodyScripts = scriptPlacement === "body" ? scriptTags : "";
  const bodyContent = [html, dataScript, bodyScripts].filter(Boolean).join("\n    ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${headContent}
  </head>
  <body>
    ${bodyContent}
  </body>
</html>`;
}
