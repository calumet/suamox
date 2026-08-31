import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  ApiContext,
  LoaderContext,
  RenderOptions,
  RouteRecord,
  RenderResult,
} from "@calumet/suamox";
import {
  RedirectResponse,
  generateHTML,
  matchRoute,
  renderPage,
  resolveRouteModule,
  serializeData,
  stripBase,
} from "@calumet/suamox";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { proxy as honoProxy } from "hono/proxy";
import pc from "picocolors";
import { normalizePath, type EnvironmentModuleNode, type ViteDevServer } from "vite";
import type { ModuleRunner } from "vite/module-runner";

export interface HonoAdapterOptions {
  onRequest?: (c: Context) => void | Promise<void>;
  onBeforeRender?: (ctx: RenderOptions) => RenderOptions | Promise<RenderOptions>;
  onAfterRender?: (result: RenderResult) => RenderResult | Promise<RenderResult>;
  allowedHosts?: string[];
}

export type ProxyConfig = Record<string, string>;

export interface CreateServerOptions extends HonoAdapterOptions {
  port?: number;
  hostname?: string;
  clientDir?: string;
  serverEntry?: string;
  proxy?: ProxyConfig;
}

export interface DevHandlerOptions extends HonoAdapterOptions {
  vite: ViteDevServer;
  root?: string;
}

export interface ProdHandlerOptions extends HonoAdapterOptions {
  clientDir?: string;
  serverEntry?: string;
  root?: string;
  staticDir?: string;
  base?: string;
  proxy?: ProxyConfig;
}

const cssImportPattern = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+\.css(?:\?[^'"]*)?)['"]/g;

const toPosixPath = (value: string): string => value.replace(/\\/g, "/");

const toFetchHeaders = (headers: IncomingHttpHeaders): Headers => {
  const mappedHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      mappedHeaders.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const headerValue of value) {
        mappedHeaders.append(key, headerValue);
      }
    }
  }

  return mappedHeaders;
};

const methodSupportsRequestBody = (method: string): boolean => {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod !== "GET" && normalizedMethod !== "HEAD";
};

const toFetchRequest = (req: IncomingMessage, allowedHosts?: string[]): Request => {
  const method = req.method ?? "GET";
  const host = resolveHost(req.headers.host, allowedHosts);
  const requestUrl = `http://${host}${req.url || "/"}`;
  const init: RequestInit & { duplex?: "half"; body?: unknown } = {
    method,
    headers: toFetchHeaders(req.headers),
  };

  if (methodSupportsRequestBody(method)) {
    init.body = req;
    init.duplex = "half";
  }

  return new Request(requestUrl, init);
};

const splitQuery = (value: string): { path: string; query: string } => {
  const queryIndex = value.indexOf("?");
  if (queryIndex < 0) {
    return { path: value, query: "" };
  }
  return {
    path: value.slice(0, queryIndex),
    query: value.slice(queryIndex),
  };
};

const isLocalhost = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

const extractHostname = (hostWithPort: string): string => {
  if (hostWithPort.startsWith("[")) {
    const closeBracket = hostWithPort.indexOf("]");
    return closeBracket > 0 ? hostWithPort.slice(1, closeBracket) : hostWithPort;
  }
  return hostWithPort.split(":")[0] ?? hostWithPort;
};

const matchAllowedHost = (hostname: string, allowedHosts: string[]): boolean =>
  allowedHosts.some((pattern) => {
    if (pattern.startsWith("*.")) {
      const domain = pattern.slice(2);
      return hostname === domain || hostname.endsWith(`.${domain}`);
    }
    return hostname === pattern;
  });

/**
 * Valida el Host header contra una lista de hosts permitidos.
 * Si no hay lista o el host no es válido, retorna "localhost".
 */
const resolveHost = (hostHeader: string | undefined, allowedHosts?: string[]): string => {
  const raw = hostHeader || "localhost";
  if (raw.includes("/") || raw.includes("\\")) {
    return "localhost";
  }
  const hostname = extractHostname(raw);
  if (isLocalhost(hostname)) {
    return raw;
  }
  if (!allowedHosts || allowedHosts.length === 0) {
    return "localhost";
  }
  return matchAllowedHost(hostname, allowedHosts) ? raw : "localhost";
};

/**
 * Extrae un origin seguro de un Request, validando contra allowedHosts.
 */
const resolveRequestOrigin = (request: Request, allowedHosts?: string[]): string => {
  const url = new URL(request.url);
  const validatedHost = resolveHost(url.host, allowedHosts);
  return `${url.protocol}//${validatedHost}`;
};

const collectCssImportsFromEntryClient = async (
  root: string,
  vite?: ViteDevServer,
): Promise<string[]> => {
  const entryClientPath = resolve(root, "src", "entry-client.tsx");
  let entryClientSource = "";
  try {
    entryClientSource = await readFile(entryClientPath, "utf-8");
  } catch {
    return [];
  }

  const links = new Set<string>();
  for (const match of entryClientSource.matchAll(cssImportPattern)) {
    const rawImport = match[1];
    if (!rawImport) {
      continue;
    }

    const { path, query } = splitQuery(rawImport);
    let href: string | null = null;

    if (path.startsWith("/")) {
      href = `${path}${query}`;
    } else if (path.startsWith(".")) {
      const absoluteCssPath = resolve(dirname(entryClientPath), path);
      const relativeCssPath = relative(root, absoluteCssPath);
      if (!relativeCssPath.startsWith("..") && !isAbsolute(relativeCssPath)) {
        href = `/${toPosixPath(relativeCssPath)}${query}`;
      }
    }

    if (!href) {
      continue;
    }

    // El CSS se sirve al navegador, asi que se transforma en el entorno client.
    // `vite.transformRequest` esta marcado para eliminarse en Vite 9.
    const clientEnvironment = vite?.environments?.client;
    if (typeof clientEnvironment?.transformRequest === "function") {
      try {
        await clientEnvironment.transformRequest(href);
      } catch {
        continue;
      }
    }

    links.add(href);
  }

  return Array.from(links);
};

/**
 * Recolecta el CSS que importa la pagina renderizada, recorriendo el grafo de
 * modulos del entorno SSR desde su archivo.
 *
 * El regex sobre entry-client.tsx solo ve el CSS global; el CSS que importa una
 * pagina concreta (o sus componentes) no aparece ahi y causaria un flash sin
 * estilos en dev. Tras renderizar, ese CSS ya esta en el grafo SSR de la
 * pagina, asi que se recorre `importedModules` transitivamente y se toman las
 * URLs `.css` (que Vite sirve directamente como `<link>` en dev).
 *
 * Solo aplica a dev; en produccion el CSS lo emite el build del cliente.
 */
const collectPageCssFromSsrGraph = (vite: ViteDevServer, filePath: string): string[] => {
  const graph = vite.environments?.ssr?.moduleGraph;
  const mods = graph?.getModulesByFile(normalizePath(filePath));
  if (!mods) {
    return [];
  }

  const seen = new Set<EnvironmentModuleNode>();
  const css = new Set<string>();
  const walk = (mod: EnvironmentModuleNode): void => {
    if (seen.has(mod)) {
      return;
    }
    seen.add(mod);
    for (const dep of mod.importedModules) {
      if (dep.url && /\.css($|\?)/.test(dep.url)) {
        css.add(dep.url);
      }
      walk(dep);
    }
  };
  for (const mod of mods) {
    walk(mod);
  }

  return Array.from(css);
};

/**
 * Middleware function that can intercept and wrap the request/response pipeline.
 *
 * `context.locals` is shared by reference with the pipeline. Populate it
 * **before** calling `next()`, writes made after `next()` resolves will
 * mutate the same object the pipeline already consumed.
 *
 * `context.pathname` is the requested page route without `base`. Use it to
 * guard routes: on the `/__data` endpoint `url.pathname` is `/__data`, so a
 * guard reading `url` never fires during client-side navigation.
 *
 * Calling `next()` executes the full pipeline (loaders + render) and returns
 * the real `Response`. Not calling `next()` short-circuits the pipeline.
 */
type MiddlewareFunction = (
  context: {
    request: Request;
    url: URL;
    pathname: string;
    params: Record<string, string>;
    locals: Record<string, unknown>;
  },
  next: () => Promise<Response>,
) => Response | Promise<Response>;

const runMiddleware = async (
  middlewareFn: MiddlewareFunction | undefined,
  request: Request,
  url: URL,
  pathname: string,
  params: Record<string, string>,
  pipeline: (locals: Record<string, unknown>) => Promise<Response>,
): Promise<Response> => {
  if (!middlewareFn) {
    return pipeline({});
  }

  const locals: Record<string, unknown> = {};
  const context = { request, url, pathname, params, locals };
  return middlewareFn(context, () => pipeline(locals));
};

/**
 * Rechaza requests cross-origin al endpoint /__data usando Sec-Fetch-Site.
 * Retorna true si el request debe ser bloqueado.
 */
const isInvalidDataRequest = (c: Context): boolean => {
  const fetchSite = c.req.header("sec-fetch-site");
  return !!fetchSite && fetchSite !== "same-origin" && fetchSite !== "none";
};

/**
 * Crea una app de Hono con soporte SSR
 */
export function createHonoApp(_options: HonoAdapterOptions = {}): Hono {
  const app = new Hono();

  app.use("*", bodyLimit({ maxSize: 1024 * 1024 }));
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "SAMEORIGIN");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  // Endpoint de health check
  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  return app;
}

/**
 * Crea e inicia un servidor (dev o prod según NODE_ENV)
 */
export async function createServer(options: CreateServerOptions): Promise<void> {
  const { port = 3000, hostname, ...adapterOptions } = options;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    // Modo producción: usar serve estándar
    const { serve } = await import("@hono/node-server");
    const app = createProdHandler(adapterOptions);
    if (hostname) {
      console.log(`Production server running at http://${hostname}:${port}`);
      serve({ fetch: app.fetch, port, hostname });
    } else {
      console.log(`Production server running at http://localhost:${port}`);
      serve({ fetch: app.fetch, port });
    }
  } else {
    // Modo desarrollo: integrar middleware de Vite
    const { createServer: createViteServer } = await import("vite");
    const { createServer: createNodeServer } = await import("node:http");

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });

    const app = createDevHandler({ vite, ...adapterOptions });

    // Crear servidor HTTP que use middleware de Vite y Hono
    const server = createNodeServer((req, res) => {
      // Intentar primero el middleware de Vite
      vite.middlewares(req, res, async () => {
        // Si Vite no lo maneja, usar Hono
        const request = toFetchRequest(req, options.allowedHosts);

        const response = await app.fetch(request);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

        if (response.body) {
          const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
          const pump = async (): Promise<void> => {
            const readResult = await reader.read();
            if (readResult.done || !readResult.value) {
              res.end();
              return;
            }
            res.write(readResult.value);
            return pump();
          };
          await pump();
        } else {
          res.end();
        }
      });
    });

    server.listen(port);
    console.log(`Development server running at http://localhost:${port}`);
  }
}

/**
 * Obtiene el module runner del entorno SSR de Vite.
 *
 * Reemplaza a `vite.ssrLoadModule()`, que la Environment API deja obsoleto.
 * Disponible desde Vite 6: `defaultCreateDevEnvironment()` ya construye un
 * `RunnableDevEnvironment` para todo entorno que no sea el cliente.
 *
 * Se detecta por duck typing en vez de con `isRunnableDevEnvironment()` porque
 * ese guard usa `instanceof`, lo que impediria inyectar un servidor de prueba.
 *
 * El caso realista de fallo no es una version vieja de Vite sino un entorno SSR
 * no ejecutable en proceso: si el usuario configura un runtime tipo Cloudflare
 * Workers, ese entorno no expone `runner` y el render debe fallar con un
 * mensaje claro en vez de un `TypeError` dentro del framework.
 */
const ssrRunner = (vite: ViteDevServer): ModuleRunner => {
  const environment = vite.environments?.ssr as unknown as { runner?: ModuleRunner } | undefined;
  const runner = environment?.runner;

  if (!runner || typeof runner.import !== "function") {
    throw new Error(
      "[suamox] El entorno SSR de Vite no expone un module runner. " +
        "El adapter de Hono renderiza en el mismo proceso que Vite, asi que " +
        "requiere un RunnableDevEnvironment (el que Vite crea por defecto). " +
        "Si configuraste un runtime externo (Cloudflare Workers, workerd, etc.) " +
        "ese entorno no es compatible con este adapter.",
    );
  }

  return runner;
};

/**
 * Crea el handler de desarrollo con integración de Vite
 */
export function createDevHandler(options: DevHandlerOptions): Hono {
  const { vite, onRequest, onBeforeRender, onAfterRender, root = process.cwd() } = options;
  const app = createHonoApp(options);

  // Carga @calumet/suamox a través de Vite para compartir la misma instancia
  // de contextos React (LoaderDataContext, StaticPropsContext) con las páginas.
  const loadRuntime = () =>
    ssrRunner(vite).import<typeof import("@calumet/suamox")>("@calumet/suamox");

  const loadMiddleware = async (): Promise<MiddlewareFunction | undefined> => {
    const mod = await ssrRunner(vite).import<{ onRequest?: MiddlewareFunction }>(
      "virtual:pages/server",
    );
    return mod.onRequest;
  };

  // API routes handler (dev)
  app.all("/api/*", async (c) => {
    try {
      const runtime = await loadRuntime();
      const routesModule = await ssrRunner(vite).import<{
        routes: RouteRecord[];
        apiRoutes?: Array<{
          path: string;
          methods: Record<string, (ctx: ApiContext) => Response | Promise<Response>>;
          params: string[];
          isCatchAll: boolean;
          isIndex: boolean;
          priority: number;
        }>;
        base?: string;
      }>("virtual:pages/server");

      const apiRoutes = routesModule.apiRoutes;
      if (!apiRoutes || apiRoutes.length === 0) {
        return c.notFound();
      }

      const base = routesModule.base ?? "/";
      const url = new URL(c.req.url);
      const strippedPathname = stripBase(url.pathname, base);

      const match = runtime.matchRoute(apiRoutes as unknown as RouteRecord[], strippedPathname);
      if (!match) return c.notFound();

      const middlewareFn = await loadMiddleware();
      return await runMiddleware(
        middlewareFn,
        c.req.raw,
        url,
        strippedPathname,
        match.params,
        async (locals) => {
          const method = c.req.method.toUpperCase();
          const apiRoute = match.route as unknown as {
            methods: Record<string, (ctx: ApiContext) => Response | Promise<Response>>;
          };
          const handler = apiRoute.methods[method];
          if (!handler) {
            return new Response("Method Not Allowed", {
              status: 405,
              headers: { Allow: Object.keys(apiRoute.methods).join(", ") },
            });
          }

          return handler({
            request: c.req.raw,
            url,
            params: match.params,
            query: url.searchParams,
            locals,
          });
        },
      );
    } catch (error) {
      if (error instanceof RedirectResponse) {
        return c.redirect(error.location, error.status as 301 | 302 | 303 | 307 | 308);
      }
      console.error(pc.red("[API Route Error]"), error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // Endpoint de datos para client-side navigation
  app.get("/__data", async (c) => {
    if (isInvalidDataRequest(c)) {
      return c.json({ error: "Cross-origin request blocked" }, 403);
    }

    const path = c.req.query("path");
    if (!path) {
      return c.json({ error: "Missing path parameter" }, 400);
    }
    if (!path.startsWith("/") || path.startsWith("//")) {
      return c.json({ error: "Invalid path parameter" }, 400);
    }

    try {
      const runtime = await loadRuntime();
      const routesModule = await ssrRunner(vite).import<{
        routes: RouteRecord[];
        base?: string;
      }>("virtual:pages/server");
      const routes = routesModule.routes;
      const routeBase = routesModule.base ?? "/";
      const strippedPathname = stripBase(path, routeBase);

      const match = runtime.matchRoute(routes, strippedPathname);
      if (!match) {
        return c.json(null, 404);
      }

      const resolved = await runtime.resolveRouteModule(match.route);

      // Ejecutar middleware y pipeline de datos
      const middlewareFn = await loadMiddleware();
      const reqUrl = new URL(c.req.url);
      return await runMiddleware(
        middlewareFn,
        c.req.raw,
        reqUrl,
        strippedPathname,
        match.params,
        async (locals) => {
          const loaderUrl = new URL(path, reqUrl.origin);
          reqUrl.searchParams.forEach((value, key) => {
            if (key !== "path" && key !== "stableLayouts") {
              loaderUrl.searchParams.append(key, value);
            }
          });

          const loaderContext: LoaderContext = {
            request: c.req.raw,
            url: loaderUrl,
            params: match.params,
            query: loaderUrl.searchParams,
            locals,
          };

          // Layout loaders + page loader en paralelo
          const layoutInfos = resolved.layoutInfos;
          const hasLayoutLoaders = layoutInfos?.some((li: { loader?: unknown }) => li.loader);

          if (hasLayoutLoaders) {
            const stableParam = c.req.query("stableLayouts");
            const validIds = new Set(layoutInfos!.map((li: { routeId: string }) => li.routeId));
            const stableSet = stableParam
              ? new Set(stableParam.split(",").filter((id) => validIds.has(id)))
              : new Set<string>();

            const layoutPromises = layoutInfos!
              .filter((info: { loader?: unknown }) => !!info.loader)
              .map(async (info) => ({
                routeId: info.routeId,
                data: stableSet.has(info.routeId) ? null : await info.loader!(loaderContext),
              }));

            const pagePromise = resolved.loader
              ? resolved.loader(loaderContext)
              : Promise.resolve(null);

            const [layoutResults, pageData] = await Promise.all([
              Promise.all(layoutPromises),
              pagePromise,
            ]);

            const layouts: Record<string, unknown> = {};
            for (const result of layoutResults) {
              layouts[result.routeId] = result.data;
            }

            return c.json({ page: pageData, layouts });
          }

          // Legacy: sin layout loaders
          if (!resolved.loader) {
            return c.json(null);
          }
          const data = await resolved.loader(loaderContext);
          return c.json(data);
        },
      );
    } catch (error) {
      if (error instanceof RedirectResponse) {
        return c.json({ __redirect: error.location, __status: error.status });
      }
      console.error(pc.red("[Data Endpoint Error]"), error);
      return c.json({ error: "Loader error" }, 500);
    }
  });

  // Handler SSR para páginas (el middleware de Vite se maneja en createServer)
  app.use("*", async (c) => {
    const url = new URL(c.req.url);

    try {
      // Ejecutar hook onRequest
      if (onRequest) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await onRequest(c);
      }

      // Cargar runtime y rutas a través de Vite para compartir instancias de contexto
      const runtime = await loadRuntime();
      const routesModule = await ssrRunner(vite).import<{
        routes: RouteRecord[];
        base?: string;
      }>("virtual:pages/server");
      const routes = routesModule.routes;
      const base = routesModule.base ?? "/";
      const strippedPathname = stripBase(url.pathname, base);
      const match = runtime.matchRoute(routes, strippedPathname);

      // Ejecutar middleware de usuario y pipeline SSR
      const middlewareFn = await loadMiddleware();
      return await runMiddleware(
        middlewareFn,
        c.req.raw,
        url,
        strippedPathname,
        match?.params ?? {},
        async (locals) => {
          // Resolver módulo de ruta para detectar prerender y getStaticPaths
          let staticProps: Record<string, unknown> | undefined;
          let isPrerender = false;
          if (match) {
            const resolved = await runtime.resolveRouteModule(match.route);
            isPrerender = resolved.prerender === true;
            if (resolved.getStaticPaths) {
              const entries = await resolved.getStaticPaths();
              const entry = entries.find((e) =>
                Object.entries(match.params).every(([k, v]) => e.params[k] === v),
              );
              if (entry?.props) {
                staticProps = entry.props;
              }
            }
          }

          // Ejecutar hook onBeforeRender
          let renderContext: RenderOptions = {
            pathname: strippedPathname,
            request: c.req.raw,
            routes,
            props: staticProps,
            locals,
          };
          if (onBeforeRender) {
            renderContext = await onBeforeRender(renderContext);
          }

          // Renderizar página
          let result = await runtime.renderPage(renderContext);

          // Ejecutar hook onAfterRender
          if (onAfterRender) {
            result = await onAfterRender(result);
          }

          if (result.redirectTo) {
            return c.redirect(result.redirectTo, result.status as 301 | 302 | 303 | 307 | 308);
          }

          const escapeAttr = (v: string): string =>
            v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
          const entryCssLinks = await collectCssImportsFromEntryClient(root, vite);
          // CSS que importa la pagina renderizada (no visible desde entry-client)
          const pageCssLinks = match ? collectPageCssFromSsrGraph(vite, match.route.filePath) : [];
          const devCssLinks = Array.from(new Set([...entryCssLinks, ...pageCssLinks]));
          const devCssTags = devCssLinks
            .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`)
            .join("\n    ");

          // Scripts de cliente: solo para rutas que no son prerender
          const clientScripts = isPrerender
            ? ""
            : `<link rel="modulepreload" href="/src/entry-client.tsx">
    <script type="module" src="/src/entry-client.tsx"></script>`;

          // Leer y transformar index.html
          const template = await vite.transformIndexHtml(
            url.pathname,
            `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${devCssTags}
    ${result.head || ""}
    ${clientScripts}
  </head>
  <body>
    <div id="root">${result.html}</div>
  </body>
</html>`,
          );

          // Inyectar datos iniciales solo para rutas con hidratación
          let finalHtml = template;
          if (!isPrerender) {
            const initialDataPayload = result.layoutData
              ? { page: result.initialData ?? null, layouts: result.layoutData }
              : (result.initialData ?? null);
            const serializedData = serializeData(initialDataPayload);
            finalHtml = template.replace(
              "</body>",
              `<script>window.__INITIAL_DATA__ = ${serializedData};</script></body>`,
            );
          }

          return c.html(finalHtml, result.status as 200 | 404 | 500);
        },
      );
    } catch (error) {
      if (error instanceof RedirectResponse) {
        return c.redirect(error.location, error.status as 301 | 302 | 303 | 307 | 308);
      }
      console.error(pc.red("[SSR Error]"), error);

      return c.html("<h1>500 - Internal Server Error</h1>", 500);
    }
  });

  return app;
}

/**
 * Crea el handler de producción para servir assets compilados
 */
export function createProdHandler(options: ProdHandlerOptions): Hono {
  const {
    clientDir = "dist/client",
    serverEntry = "dist/server/entry-server.js",
    onRequest,
    onBeforeRender,
    onAfterRender,
    root = process.cwd(),
    staticDir = "dist/static",
    base = "/",
    allowedHosts,
    proxy,
  } = options;

  const app = createHonoApp(options);

  // Proxy reverso: reenvía rutas configuradas al backend
  if (proxy) {
    for (const [path, target] of Object.entries(proxy)) {
      const targetOrigin = new URL(target).origin;

      const handler = (c: Context) => {
        const url = new URL(c.req.url);
        return honoProxy(`${targetOrigin}${url.pathname}${url.search}`, {
          ...c.req,
          headers: c.req.header(),
        });
      };

      app.all(`${path}`, handler);
      app.all(`${path}/*`, handler);
    }
  }

  // Convertir el path relativo del entry del servidor a URL absoluta para import dinámico
  const serverEntryPath = resolve(root, serverEntry);
  const serverEntryURL = pathToFileURL(serverEntryPath).href;

  const staticRoot = resolve(root, staticDir);
  const staticFallbackEnabled = staticRoot.length > 0;

  // Leer el manifest de Vite para obtener nombres de assets con hash
  const manifestPath = resolve(root, clientDir, ".vite/manifest.json");
  type ManifestEntry = {
    file: string;
    css?: string[];
    imports?: string[];
    dynamicImports?: string[];
  };
  type Manifest = Record<string, ManifestEntry>;
  let manifest: Manifest = {};
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
  } catch {
    console.warn("[Hono Adapter] Could not read Vite manifest, client assets may not load");
  }

  // Obtener script de entrada del cliente desde el manifest
  const entryClientScript = manifest["index.html"]?.file
    ? `/${manifest["index.html"].file}`
    : "/assets/index.js";

  const toManifestKey = (filePath: string): string | null => {
    const relativePath = relative(root, filePath).replace(/\\/g, "/");
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return null;
    }
    return relativePath;
  };

  const isScriptAsset = (filePath: string): boolean => {
    return filePath.endsWith(".js") || filePath.endsWith(".mjs");
  };

  const collectManifestAssets = (
    routes: RouteRecord[],
    pathname: string,
  ): { preloadScripts: string[]; styles: string[] } => {
    const preloadScripts = new Set<string>();
    const styles = new Set<string>();
    preloadScripts.add(entryClientScript);

    const manifestKeys = Object.keys(manifest);
    if (manifestKeys.length === 0) {
      return {
        preloadScripts: Array.from(preloadScripts),
        styles: Array.from(styles),
      };
    }

    const visited = new Set<string>();
    const visit = (key: string): void => {
      if (visited.has(key)) {
        return;
      }
      visited.add(key);
      const entry = manifest[key];
      if (!entry) {
        return;
      }

      if (entry.file && isScriptAsset(entry.file)) {
        const href = `/${entry.file}`;
        preloadScripts.add(href);
      }
      for (const cssPath of entry.css ?? []) {
        styles.add(`/${cssPath}`);
      }
      for (const importKey of entry.imports ?? []) {
        visit(importKey);
      }
    };

    visit("index.html");

    const matched = matchRoute(routes, pathname);
    const routeKey = matched?.route?.filePath ? toManifestKey(matched.route.filePath) : null;
    if (routeKey) {
      visit(routeKey);
    }

    for (const layoutPath of matched?.route?.layoutFilePaths ?? []) {
      const layoutKey = toManifestKey(layoutPath);
      if (layoutKey) {
        visit(layoutKey);
      }
    }

    return {
      preloadScripts: Array.from(preloadScripts),
      styles: Array.from(styles),
    };
  };

  // Servir assets estáticos desde el directorio de build del cliente
  const assetHandler = serveStatic({ root: clientDir }) as (
    c: Context,
    next: () => Promise<void>,
  ) => Promise<Response | void>;
  app.use("/assets/*", async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const response = await assetHandler(c, next);
    const headers = response?.headers;
    if (
      headers &&
      typeof headers.set === "function" &&
      /^\/assets\/(index|client|jsx-runtime)-[^/]+\.js$/.test(c.req.path)
    ) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    return response;
  });
  /* Servir archivos de public/ que Vite copia a clientDir (img, fonts, etc.).

     Las rutas de directorio se saltan. Vite emite su `index.html` en este mismo
     directorio, y servirlo como índice de `/` responde antes de llegar al
     renderizador: la raíz se queda sin SSR y sin su HTML prerenderizado. El
     resto de las rutas nunca lo notaron porque no resuelven a ningún archivo y
     caen a `next()`. */
  const publicHandler = serveStatic({ root: clientDir }) as (
    c: Context,
    next: () => Promise<void>,
  ) => Promise<Response | void>;
  app.use("*", async (c, next) => {
    if (c.req.path.endsWith("/")) {
      return next();
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return publicHandler(c, next);
  });

  if (staticFallbackEnabled) {
    app.use("/client/*", serveStatic({ root: staticDir }));
  }

  const resolveStaticHtmlPath = (pathname: string): string | null => {
    const normalizedPath = pathname === "/" ? "" : pathname;
    const candidatePath = resolve(staticRoot, `.${normalizedPath}`, "index.html");
    const relativePath = relative(staticRoot, candidatePath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      return null;
    }

    return candidatePath;
  };

  const readStaticHtml = async (pathname: string): Promise<string | null> => {
    if (!staticFallbackEnabled) {
      return null;
    }

    const filePath = resolveStaticHtmlPath(pathname);
    if (!filePath) {
      return null;
    }

    try {
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  };

  // Carga el runtime desde el server entry para compartir la misma instancia
  // de contextos React (LoaderDataContext, StaticPropsContext) con las páginas.
  type ApiRouteEntry = {
    path: string;
    methods: Record<string, (ctx: ApiContext) => Response | Promise<Response>>;
    params: string[];
    isCatchAll: boolean;
    isIndex: boolean;
    priority: number;
  };

  type ServerEntryRuntime = {
    routes: RouteRecord[];
    apiRoutes?: ApiRouteEntry[];
    renderPage: typeof renderPage;
    matchRoute: typeof matchRoute;
    resolveRouteModule: typeof resolveRouteModule;
    onRequest?: MiddlewareFunction;
  };

  const loadServerEntry = async (): Promise<ServerEntryRuntime> => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const serverModule = await import(serverEntryURL);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const routes = serverModule.routes as RouteRecord[];
    if (!routes) {
      throw new Error("Server entry must export routes");
    }
    const mod = serverModule as Record<string, unknown>;
    return {
      routes,
      apiRoutes: mod.apiRoutes as ApiRouteEntry[] | undefined,
      renderPage: (mod.renderPage as typeof renderPage) ?? renderPage,
      matchRoute: (mod.matchRoute as typeof matchRoute) ?? matchRoute,
      resolveRouteModule:
        (mod.resolveRouteModule as typeof resolveRouteModule) ?? resolveRouteModule,
      onRequest: mod.onRequest as MiddlewareFunction | undefined,
    };
  };

  // API routes handler (prod)
  app.all("/api/*", async (c) => {
    try {
      const entry = await loadServerEntry();
      const apiRoutes = entry.apiRoutes;
      if (!apiRoutes || apiRoutes.length === 0) {
        return c.notFound();
      }

      const url = new URL(c.req.url);
      const safeOrigin = resolveRequestOrigin(c.req.raw, allowedHosts);
      const safeUrl = new URL(`${safeOrigin}${url.pathname}${url.search}`);
      const safeRequest = new Request(safeUrl, { headers: c.req.raw.headers });

      const strippedPathname = stripBase(url.pathname, base);
      const match = entry.matchRoute(apiRoutes as unknown as RouteRecord[], strippedPathname);
      if (!match) return c.notFound();

      return await runMiddleware(
        entry.onRequest,
        safeRequest,
        safeUrl,
        strippedPathname,
        match.params,
        async (locals) => {
          const method = c.req.method.toUpperCase();
          const apiRoute = match.route as unknown as ApiRouteEntry;
          const handler = apiRoute.methods[method];
          if (!handler) {
            return new Response("Method Not Allowed", {
              status: 405,
              headers: { Allow: Object.keys(apiRoute.methods).join(", ") },
            });
          }

          return handler({
            request: c.req.raw,
            url: safeUrl,
            params: match.params,
            query: safeUrl.searchParams,
            locals,
          });
        },
      );
    } catch (error) {
      if (error instanceof RedirectResponse) {
        return c.redirect(error.location, error.status as 301 | 302 | 303 | 307 | 308);
      }
      console.error(pc.red("[API Route Error]"), error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // Endpoint de datos para client-side navigation
  app.get("/__data", async (c) => {
    if (isInvalidDataRequest(c)) {
      return c.json({ error: "Cross-origin request blocked" }, 403);
    }

    const path = c.req.query("path");
    if (!path) {
      return c.json({ error: "Missing path parameter" }, 400);
    }
    if (!path.startsWith("/") || path.startsWith("//")) {
      return c.json({ error: "Invalid path parameter" }, 400);
    }

    try {
      const entry = await loadServerEntry();
      const strippedPathname = stripBase(path, base);
      const match = entry.matchRoute(entry.routes, strippedPathname);
      if (!match) {
        return c.json(null, 404);
      }

      const resolved = await entry.resolveRouteModule(match.route);

      const safeOrigin = resolveRequestOrigin(c.req.raw, allowedHosts);
      const originalUrl = new URL(c.req.url);
      const safeUrl = new URL(`${safeOrigin}${originalUrl.pathname}${originalUrl.search}`);
      const safeRequest = new Request(safeUrl, { headers: c.req.raw.headers });

      // Ejecutar middleware y pipeline de datos
      return await runMiddleware(
        entry.onRequest,
        safeRequest,
        safeUrl,
        strippedPathname,
        match.params,
        async (locals) => {
          const loaderUrl = new URL(path, safeOrigin);
          originalUrl.searchParams.forEach((value, key) => {
            if (key !== "path" && key !== "stableLayouts") {
              loaderUrl.searchParams.append(key, value);
            }
          });

          const loaderContext: LoaderContext = {
            request: c.req.raw,
            url: loaderUrl,
            params: match.params,
            query: loaderUrl.searchParams,
            locals,
          };

          // Layout loaders + page loader en paralelo
          const layoutInfos = resolved.layoutInfos as
            | Array<{ loader?: (ctx: LoaderContext) => Promise<unknown>; routeId: string }>
            | undefined;
          const hasLayoutLoaders = layoutInfos?.some((li) => li.loader);

          if (hasLayoutLoaders) {
            const stableParam = c.req.query("stableLayouts");
            const validIds = new Set(layoutInfos!.map((li) => li.routeId));
            const stableSet = stableParam
              ? new Set(stableParam.split(",").filter((id) => validIds.has(id)))
              : new Set<string>();

            const layoutPromises = layoutInfos!
              .filter((info) => info.loader)
              .map(async (info) => ({
                routeId: info.routeId,
                data: stableSet.has(info.routeId) ? null : await info.loader!(loaderContext),
              }));

            const pagePromise = resolved.loader
              ? resolved.loader(loaderContext)
              : Promise.resolve(null);

            const [layoutResults, pageData] = await Promise.all([
              Promise.all(layoutPromises),
              pagePromise,
            ]);

            const layouts: Record<string, unknown> = {};
            for (const result of layoutResults) {
              layouts[result.routeId] = result.data;
            }

            return c.json({ page: pageData, layouts });
          }

          // Legacy: sin layout loaders
          if (!resolved.loader) {
            return c.json(null);
          }
          const data = await resolved.loader(loaderContext);
          return c.json(data);
        },
      );
    } catch (error) {
      if (error instanceof RedirectResponse) {
        return c.json({ __redirect: error.location, __status: error.status });
      }
      console.error(pc.red("[Data Endpoint Error]"), (error as Error).message);
      return c.json({ error: "Loader error" }, 500);
    }
  });

  // Handler SSR: solo para rutas que no son assets
  app.use("*", async (c) => {
    // Omitir si está solicitando un archivo de assets
    if (c.req.path.startsWith("/assets/")) {
      return c.notFound();
    }
    const url = new URL(c.req.url);

    const staticHtml = await readStaticHtml(url.pathname);
    if (staticHtml) {
      const status = url.pathname === "/404" ? 404 : 200;
      return c.html(staticHtml, status);
    }

    try {
      // Ejecutar hook onRequest
      if (onRequest) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await onRequest(c);
      }

      const entry = await loadServerEntry();
      const strippedPathname = stripBase(url.pathname, base);
      const match = entry.matchRoute(entry.routes, strippedPathname);

      // Ejecutar middleware de usuario con origin validado y pipeline SSR
      const safeOrigin = resolveRequestOrigin(c.req.raw, allowedHosts);
      const safeUrl = new URL(`${safeOrigin}${url.pathname}${url.search}`);
      const safeRequest = new Request(safeUrl, { headers: c.req.raw.headers });

      return await runMiddleware(
        entry.onRequest,
        safeRequest,
        safeUrl,
        strippedPathname,
        match?.params ?? {},
        async (locals) => {
          // Ejecutar hook onBeforeRender
          let renderContext: RenderOptions = {
            pathname: strippedPathname,
            request: safeRequest,
            routes: entry.routes,
            locals,
          };
          if (onBeforeRender) {
            renderContext = await onBeforeRender(renderContext);
          }

          // Renderizar página
          let result = await entry.renderPage(renderContext);

          // Ejecutar hook onAfterRender
          if (onAfterRender) {
            result = await onAfterRender(result);
          }

          if (result.redirectTo) {
            return c.redirect(result.redirectTo, result.status as 301 | 302 | 303 | 307 | 308);
          }

          // Detectar si la ruta es prerender
          const resolvedMatch = match ? await entry.resolveRouteModule(match.route) : null;
          const isPrerender = resolvedMatch?.prerender === true;

          // Generar HTML completo (sin hidratación para rutas prerender)
          const { preloadScripts, styles } = collectManifestAssets(entry.routes, strippedPathname);
          const prodInitialData = isPrerender
            ? undefined
            : result.layoutData
              ? { page: result.initialData ?? null, layouts: result.layoutData }
              : result.initialData;
          const html = generateHTML({
            html: `<div id="root">${result.html}</div>`,
            head: result.head,
            initialData: prodInitialData,
            scripts: isPrerender ? [] : [entryClientScript],
            preloadScripts: isPrerender ? [] : preloadScripts,
            styles,
            scriptPlacement: "head",
            includeInitialDataScript: !isPrerender,
          });

          return c.html(html, result.status as 200 | 404 | 500);
        },
      );
    } catch (error) {
      if (error instanceof RedirectResponse) {
        return c.redirect(error.location, error.status as 301 | 302 | 303 | 307 | 308);
      }
      console.error(pc.red("[SSR Error]"), (error as Error).message);

      const errorHtml = generateHTML({
        html: '<div id="root"><h1>500 - Internal Server Error</h1></div>',
        head: "<title>Error</title>",
      });

      return c.html(errorHtml, 500);
    }
  });

  return app;
}

// Exportar tipos
export type { Context } from "hono";
export type { ViteDevServer } from "vite";
