import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RenderOptions, RouteRecord, RenderResult } from "@calumet/suamox";
import { generateHTML, matchRoute, renderPage, serializeData } from "@calumet/suamox";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { Hono } from "hono";
import pc from "picocolors";
import type { ViteDevServer } from "vite";

export interface HonoAdapterOptions {
  onRequest?: (c: Context) => void | Promise<void>;
  onBeforeRender?: (ctx: RenderOptions) => RenderOptions | Promise<RenderOptions>;
  onAfterRender?: (result: RenderResult) => RenderResult | Promise<RenderResult>;
}

export interface CreateServerOptions extends HonoAdapterOptions {
  port?: number;
  clientDir?: string;
  serverEntry?: string;
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

const toFetchRequest = (req: IncomingMessage): Request => {
  const method = req.method ?? "GET";
  const requestUrl = `http://${req.headers.host || "localhost"}${req.url || "/"}`;
  const init: RequestInit & { duplex?: "half"; body?: unknown } = {
    method,
    headers: toFetchHeaders(req.headers),
  };

  if (methodSupportsRequestBody(method)) {
    init.body = req;
    init.duplex = "half";
  }

  return new Request(requestUrl, init as RequestInit);
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

    if (typeof vite?.transformRequest === "function") {
      try {
        await vite.transformRequest(href);
      } catch {
        continue;
      }
    }

    links.add(href);
  }

  return Array.from(links);
};

/**
 * Crea una app de Hono con soporte SSR
 */
export function createHonoApp(_options: HonoAdapterOptions = {}): Hono {
  const app = new Hono();

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
  const { port = 3000, ...adapterOptions } = options;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    // Modo producción: usar serve estándar
    const { serve } = await import("@hono/node-server");
    const app = createProdHandler(adapterOptions);
    console.log(`Production server running at http://localhost:${port}`);
    serve({ fetch: app.fetch, port });
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
        const request = toFetchRequest(req);

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
 * Crea el handler de desarrollo con integración de Vite
 */
export function createDevHandler(options: DevHandlerOptions): Hono {
  const { vite, onRequest, onBeforeRender, onAfterRender, root = process.cwd() } = options;
  const app = createHonoApp(options);

  // Handler SSR para páginas (el middleware de Vite se maneja en createServer)
  app.use("*", async (c) => {
    const url = new URL(c.req.url);

    try {
      // Ejecutar hook onRequest
      if (onRequest) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await onRequest(c);
      }

      // Cargar módulo virtual:pages
      const routesModule = (await vite.ssrLoadModule("virtual:pages")) as {
        routes: RouteRecord[];
      };
      const routes = routesModule.routes;

      // Ejecutar hook onBeforeRender
      let renderContext: RenderOptions = { pathname: url.pathname, request: c.req.raw, routes };
      if (onBeforeRender) {
        renderContext = await onBeforeRender(renderContext);
      }

      // Renderizar página
      let result = await renderPage(renderContext);

      // Ejecutar hook onAfterRender
      if (onAfterRender) {
        result = await onAfterRender(result);
      }

      if (result.redirectTo) {
        return c.redirect(result.redirectTo, result.status as 301 | 302 | 303 | 307 | 308);
      }

      const devCssLinks = await collectCssImportsFromEntryClient(root, vite);
      const devCssTags = devCssLinks
        .map((href) => `<link rel="stylesheet" href="${href}">`)
        .join("\n    ");

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
    <link rel="modulepreload" href="/src/entry-client.tsx">
    <script type="module" src="/src/entry-client.tsx"></script>
  </head>
  <body>
    <div id="root">${result.html}</div>
  </body>
</html>`,
      );

      // Inyectar datos iniciales
      const serializedData = serializeData(result.initialData ?? null);
      const finalHtml = template.replace(
        "</body>",
        `<script>window.__INITIAL_DATA__ = ${serializedData};</script></body>`,
      );

      return c.html(finalHtml, result.status as 200 | 404 | 500);
    } catch (error) {
      // Dejar que Vite maneje errores con stack trace
      vite.ssrFixStacktrace(error as Error);
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
  } = options;

  const app = createHonoApp(options);

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
      for (const importKey of entry.dynamicImports ?? []) {
        visit(importKey);
      }
    };

    visit("index.html");

    const matched = matchRoute(routes, pathname);
    const routeKey = matched?.route?.filePath ? toManifestKey(matched.route.filePath) : null;
    if (routeKey) {
      visit(routeKey);
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

      // Importar entry del servidor (debe exportar rutas)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const serverModule = await import(serverEntryURL);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const routes = serverModule.routes as RouteRecord[];

      if (!routes) {
        throw new Error("Server entry must export routes");
      }

      // Ejecutar hook onBeforeRender
      let renderContext: RenderOptions = { pathname: url.pathname, request: c.req.raw, routes };
      if (onBeforeRender) {
        renderContext = await onBeforeRender(renderContext);
      }

      // Renderizar página
      let result = await renderPage(renderContext);

      // Ejecutar hook onAfterRender
      if (onAfterRender) {
        result = await onAfterRender(result);
      }

      if (result.redirectTo) {
        return c.redirect(result.redirectTo, result.status as 301 | 302 | 303 | 307 | 308);
      }

      // Generar HTML completo
      const { preloadScripts, styles } = collectManifestAssets(routes, url.pathname);
      const html = generateHTML({
        html: `<div id="root">${result.html}</div>`,
        head: result.head,
        initialData: result.initialData,
        scripts: [entryClientScript],
        preloadScripts,
        styles,
        scriptPlacement: "head",
      });

      return c.html(html, result.status as 200 | 404 | 500);
    } catch (error) {
      console.error(pc.red("[SSR Error]"), error);

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
