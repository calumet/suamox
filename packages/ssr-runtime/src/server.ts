import {
  HeadProvider,
  createHeadManager,
  headMarkerAttribute,
  headMarkerEndValue,
  headMarkerStartValue,
} from "@calumet/suamox-head";
import type React from "react";
import { Fragment, createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";

import { ClientValueProvider, createClientValueManager } from "./client-value.js";

import { RedirectResponse, createPageElement, matchRoute, resolveRouteModule } from "./index.js";
import type { LoaderContext, RenderOptions, RenderResult } from "./index.js";

const renderHeadToString = (nodes: React.ReactNode[]): string => {
  const startTag = `<meta ${headMarkerAttribute}="${headMarkerStartValue}">`;
  const endTag = `<meta ${headMarkerAttribute}="${headMarkerEndValue}">`;
  const content = nodes
    .map((node) => renderToStaticMarkup(createElement(Fragment, null, node)))
    .join("\n");

  return [startTag, content, endTag].filter(Boolean).join("\n");
};

/**
 * Renderiza una página con SSR
 */
export async function renderPage(options: RenderOptions): Promise<RenderResult> {
  const { pathname, request, routes, props = {}, locals = {} } = options;

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
    locals,
  };

  // Ejecutar layout loaders y page loader en paralelo
  let layoutData: Record<string, unknown> | undefined;
  let data: unknown = null;
  const layoutInfos = resolvedRoute.layoutInfos;
  const hasLayoutLoaders = layoutInfos && layoutInfos.some((li) => li.loader);

  try {
    const layoutPromise = hasLayoutLoaders
      ? Promise.all(
          layoutInfos
            .filter((info) => info.loader)
            .map(async (info) => ({
              routeId: info.routeId,
              data: await info.loader!(loaderContext),
            })),
        )
      : null;

    const pagePromise = resolvedRoute.loader ? resolvedRoute.loader(loaderContext) : null;

    const [layoutResults, pageData] = await Promise.all([layoutPromise, pagePromise]);

    if (layoutResults) {
      layoutData = {};
      for (const result of layoutResults) {
        layoutData[result.routeId] = result.data;
      }
    }

    data = pageData;
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

  // Renderizar componente con React SSR
  try {
    const headManager = createHeadManager("server");
    // Un manager por request: compartirlo entre requests filtraria los scripts de
    // una peticion en el HTML de otra
    const clientValueManager = createClientValueManager("server");
    const element = createElement(
      HeadProvider,
      { manager: headManager },
      createElement(
        ClientValueProvider,
        { value: clientValueManager },
        createPageElement(resolvedRoute, data, props, layoutData),
      ),
    );
    const html = renderToString(element);
    const head = renderHeadToString(headManager.getSnapshot());

    return {
      status,
      html,
      head,
      initialData: data,
      layoutData,
      prehydrateScripts: clientValueManager.getSnapshot(),
    };
  } catch (error) {
    console.error("Render error:", error);
    return {
      status: 500,
      html: "<h1>500 - Internal Server Error</h1>",
    };
  }
}
