import type React from 'react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

export interface RouteRecord {
  path: string;
  filePath: string;
  component: React.ComponentType<PageProps>;
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
    const match = matchPattern(route.path, normalizedPath);
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
  pattern: string,
  pathname: string
): { params: Record<string, string> } | null {
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
    const paramName = pattern.match(/\*$/)?.[0] ? '*' : 'all';

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

/**
 * Render a page with SSR
 */
export async function renderPage(options: RenderOptions): Promise<RenderResult> {
  const { pathname, request, routes } = options;

  // Match route
  const match = matchRoute(routes, pathname);

  if (!match) {
    return {
      status: 404,
      html: '<h1>404 - Page Not Found</h1>',
    };
  }

  const { route, params } = match;
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
  if (route.loader) {
    try {
      data = await route.loader(loaderContext);
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
    const element = createElement(route.component, { data });
    const html = renderToString(element);

    return {
      status: 200,
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
}): string {
  const { html, head = '', initialData, scripts = [] } = options;

  const serializedData = initialData !== undefined ? serializeData(initialData) : 'null';

  const scriptTags = scripts
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${head}
  </head>
  <body>
    ${html}
    <script>
      window.__INITIAL_DATA__ = ${serializedData};
    </script>
    ${scriptTags}
  </body>
</html>`;
}

// Prerender will be implemented in Phase 4
export function prerender(_options: unknown): void {
  throw new Error('Not implemented - will be added in Phase 4');
}
