import type React from 'react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

export interface RouteRecord {
  path: string;
  filePath: string;
  component?: React.ComponentType<PageProps>;
  load?: RouteModuleLoader;
  layouts?: Array<React.ComponentType<{ children: React.ReactNode }>>;
  getStaticPaths?: GetStaticPaths;
  prerender?: boolean;
  params: string[];
  isCatchAll: boolean;
  isIndex: boolean;
  priority: number;
  loader?: (ctx: LoaderContext) => Promise<unknown>;
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

export type GetStaticPaths = () => Promise<Array<{ params: Record<string, string> }>>;

export interface RouteModule {
  component: React.ComponentType<PageProps>;
  layouts?: Array<React.ComponentType<{ children: React.ReactNode }>>;
  loader?: (ctx: LoaderContext) => Promise<unknown>;
  getStaticPaths?: GetStaticPaths;
  prerender?: boolean;
}

export type RouteModuleLoader = () => Promise<RouteModule>;

export interface MatchResult {
  route: RouteRecord;
  params: Record<string, string>;
}

export interface RenderOptions {
  pathname: string;
  request: Request;
  routes: RouteRecord[];
}

export interface RenderResult {
  status: number;
  html: string;
  head?: string;
  initialData?: unknown;
}

/**
 * Match a pathname against routes and extract params
 */
export function matchRoute(routes: RouteRecord[], pathname: string): MatchResult | null {
  // Normalize pathname
  const normalizedPath = pathname === '' ? '/' : pathname;

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
 * Match a route pattern against a pathname
 */
function matchPattern(
  route: RouteRecord,
  pathname: string
): { params: Record<string, string> } | null {
  const pattern = route.path;
  // Handle exact match for static routes
  if (!pattern.includes(':') && !pattern.includes('*')) {
    return pattern === pathname ? { params: {} } : null;
  }

  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  // Catch-all route
  if (pattern.endsWith('/*')) {
    const basePattern = pattern.slice(0, -2);
    const baseParts = basePattern.split('/').filter(Boolean);

    // Check if base matches
    for (let i = 0; i < baseParts.length; i++) {
      const patternPart = baseParts[i];
      const pathPart = pathParts[i];

      if (!patternPart || !pathPart) {
        return null;
      }

      if (patternPart.startsWith(':')) {
        continue;
      }

      if (patternPart !== pathPart) {
        return null;
      }
    }

    // Extract catch-all param
    const catchAllParts = pathParts.slice(baseParts.length);
    const paramName = route.params[0] ?? 'all';

    return {
      params: {
        [paramName]: catchAllParts.join('/'),
      },
    };
  }

  // Dynamic route matching
  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]!;
    const pathPart = pathParts[i]!;

    if (patternPart.startsWith(':')) {
      // Dynamic parameter
      const paramName = patternPart.slice(1);
      params[paramName] = pathPart;
    } else if (patternPart !== pathPart) {
      // Static part doesn't match
      return null;
    }
  }

  return { params };
}


export function createPageElement(route: RouteRecord, data: unknown): React.ReactElement {
  if (!route.component) {
    throw new Error(`Route component not resolved for ${route.path}`);
  }
  const pageElement = createElement(route.component, { data });
  const layouts = route.layouts ?? [];
  if (layouts.length === 0) {
    return pageElement;
  }

  return layouts.reduceRight<React.ReactElement>(
    (child, Layout) => createElement(Layout, null, child),
    pageElement
  );
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
  route.loader = loaded.loader;
  route.getStaticPaths = loaded.getStaticPaths;
  route.prerender = loaded.prerender === true;

  return route;
}

export async function hydrateApp(routes: RouteRecord[]): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    return;
  }

  const match = matchRoute(routes, window.location.pathname);
  if (!match) {
    return;
  }

  const initialData = (window as Window & { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__ ?? null;
  const resolvedRoute = await resolveRouteModule(match.route);
  const element = createPageElement(resolvedRoute, initialData);

  const { hydrateRoot } = await import('react-dom/client');
  hydrateRoot(rootElement, element);
}

/**
 * Render a page with SSR
 */
export async function renderPage(options: RenderOptions): Promise<RenderResult> {
  const { pathname, request, routes } = options;

  // Match route
  const match = matchRoute(routes, pathname);
  const notFoundRoute = routes.find((route) => route.path === '/404');

  if (!match && !notFoundRoute) {
    return {
      status: 404,
      html: '<h1>404 - Page Not Found</h1>',
    };
  }

  const resolvedMatch = match ?? { route: notFoundRoute!, params: {} };
  const { route, params } = resolvedMatch;
  const status = !match || route.path === '/404' ? 404 : 200;
  const resolvedRoute = await resolveRouteModule(route);
  const url = new URL(request.url);

  // Build loader context
  const loaderContext: LoaderContext = {
    request,
    url,
    params,
    query: url.searchParams,
  };

  // Execute loader if present
  let data: unknown = null;
  if (resolvedRoute.loader) {
    try {
      data = await resolvedRoute.loader(loaderContext);
    } catch (error) {
      console.error('Loader error:', error);
      return {
        status: 500,
        html: '<h1>500 - Internal Server Error</h1>',
      };
    }
  }

  // Render component with React SSR
  try {
    const element = createPageElement(resolvedRoute, data);
    const html = renderToString(element);

    return {
      status,
      html,
      initialData: data,
    };
  } catch (error) {
    console.error('Render error:', error);
    return {
      status: 500,
      html: '<h1>500 - Internal Server Error</h1>',
    };
  }
}

/**
 * Safely serialize data for injection into HTML
 */
export function serializeData(data: unknown): string {
  const json = JSON.stringify(data);
  // Escape HTML entities to prevent XSS
  // Only escape <, >, and & which could break out of script context
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/**
 * Generate HTML template with initial data
 */
export function generateHTML(options: {
  html: string;
  head?: string;
  initialData?: unknown;
  scripts?: string[];
  includeInitialDataScript?: boolean;
}): string {
  const {
    html,
    head = '',
    initialData,
    scripts = [],
    includeInitialDataScript = true,
  } = options;

  const scriptTags = scripts
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join('\n    ');

  const dataScript = includeInitialDataScript
    ? `<script>
      window.__INITIAL_DATA__ = ${
        initialData !== undefined ? serializeData(initialData) : 'null'
      };
    </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${head}
  </head>
  <body>
    ${html}
    ${dataScript}
    ${scriptTags}
  </body>
</html>`;
}
