import { resolve } from "node:path";

import pc from "picocolors";
import { parseSync, type Plugin, type ViteDevServer } from "vite";

import { CLIENT_ROUTE_QUERY, generateRoutesModule, type DefaultPageMode } from "./codegen.js";
import { scanRoutes } from "./scanner.js";
import { stripServerExports } from "./strip-server-exports.js";
import type { ApiRouteRecord, RouteRecord } from "./types.js";
import { findServerLeaks, formatLeakError, type ChunkModules } from "./validator.js";

export interface SuamoxPagesOptions {
  pagesDir?: string;
  extensions?: string[];
  defaultMode?: DefaultPageMode;
}

export type { RouteRecord, RouteSegment, ParsedRoute } from "./types.js";

const VIRTUAL_MODULE_ID = "virtual:pages";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

const VIRTUAL_SERVER_MODULE_ID = "virtual:pages/server";
const RESOLVED_VIRTUAL_SERVER_MODULE_ID = "\0" + VIRTUAL_SERVER_MODULE_ID;

export { CLIENT_ROUTE_QUERY } from "./codegen.js";

export function suamoxPages(options: SuamoxPagesOptions = {}): Plugin {
  const { pagesDir = "src/pages", extensions = [".tsx", ".ts"], defaultMode = "ssr" } = options;

  let server: ViteDevServer | undefined;
  let root: string;
  let basePath = "/";
  let routesCache: RouteRecord[] | null = null;
  let fatalErrors: string[] = [];
  let globalMiddlewarePath: string | undefined;
  let apiRoutesCache: ApiRouteRecord[] = [];
  let clientModuleCode: string | null = null;
  let serverModuleCode: string | null = null;

  async function updateRoutes(logErrors = true): Promise<void> {
    const result = await scanRoutes({
      pagesDir,
      extensions,
      root,
    });

    routesCache = result.routes;
    globalMiddlewarePath = result.middlewarePath;
    // Los que dejan la app en un estado en que un guardia puede no correr
    fatalErrors = result.errors.filter(
      (err) => err.includes("Duplicate route path") || err.includes('must export "onRequest"'),
    );
    apiRoutesCache = result.apiRoutes;
    clientModuleCode = generateRoutesModule(result.routes, {
      defaultMode,
      base: basePath,
      target: "client",
      reroutePath: result.reroutePath,
    });
    serverModuleCode = generateRoutesModule(result.routes, {
      defaultMode,
      base: basePath,
      target: "server",
      hasMiddleware: result.hasMiddleware,
      middlewarePath: result.middlewarePath,
      reroutePath: result.reroutePath,
      apiRoutes: result.apiRoutes,
    });

    if (logErrors && result.errors.length > 0) {
      console.error(pc.red("\n[suamox:pages] Route errors:"));
      result.errors.forEach((err) => {
        console.error(pc.red(`  - ${err}`));
      });
    }

    if (logErrors && result.warnings.length > 0) {
      console.warn(pc.yellow("\n[suamox:pages] Route warnings:"));
      result.warnings.forEach((warn) => {
        console.warn(pc.yellow(`  - ${warn}`));
      });
    }

    if (server) {
      // Cada entorno (client, ssr, ...) tiene su propio module graph. El modulo
      // virtual del cliente vive en `client` y el del servidor en `ssr`, asi que
      // hay que invalidarlos entorno por entorno.
      let invalidated = false;
      for (const environment of Object.values(server.environments)) {
        for (const id of [RESOLVED_VIRTUAL_MODULE_ID, RESOLVED_VIRTUAL_SERVER_MODULE_ID]) {
          const mod = environment.moduleGraph.getModuleById(id);
          if (mod) {
            environment.moduleGraph.invalidateModule(mod);
            invalidated = true;
          }
        }
      }
      if (invalidated) {
        server.environments.client.hot.send({
          type: "full-reload",
          path: "*",
        });
      }
    }
  }

  return {
    name: "suamox:pages",

    configResolved(config) {
      root = config.root;
      basePath = config.base.replace(/\/+$/, "") || "/";
    },

    configureServer(_server) {
      server = _server;

      const absolutePagesDir = resolve(root, pagesDir);
      const absoluteApiDir = resolve(root, "src/api");

      server.watcher.add(absolutePagesDir);
      server.watcher.add(absoluteApiDir);

      const isWatchedFile = (file: string) =>
        extensions.some((ext) => file.endsWith(ext)) &&
        (file.startsWith(absolutePagesDir) || file.startsWith(absoluteApiDir));

      server.watcher.on("add", (file) => {
        if (isWatchedFile(file)) {
          const type = file.startsWith(absoluteApiDir) ? "API route" : "Page";
          console.log(pc.green(`[suamox:pages] ${type} added: ${file}`));
          // Sin el catch, un archivo que desaparece a mitad del escaneo tumba el
          // dev server con un rechazo no capturado
          void updateRoutes().catch((error: unknown) => {
            console.error(pc.red(`[suamox:pages] Route scan failed: ${String(error)}`));
          });
        }
      });

      server.watcher.on("unlink", (file) => {
        if (isWatchedFile(file)) {
          const type = file.startsWith(absoluteApiDir) ? "API route" : "Page";
          console.log(pc.yellow(`[suamox:pages] ${type} removed: ${file}`));
          // Sin el catch, un archivo que desaparece a mitad del escaneo tumba el
          // dev server con un rechazo no capturado
          void updateRoutes().catch((error: unknown) => {
            console.error(pc.red(`[suamox:pages] Route scan failed: ${String(error)}`));
          });
        }
      });
    },

    async buildStart() {
      await updateRoutes();

      // Rutas duplicadas: cual gana depende del orden, y si una esta en carpeta
      // protegida y la otra no, eso decide si el guardia corre. Middleware sin
      // `onRequest`: la carpeta se queda sin guardia. En dev solo se avisa; el
      // build no puede publicar una app asi
      if (!server && fatalErrors.length > 0) {
        this.error(
          `[suamox:pages] Route errors:\n${fatalErrors.map((e) => `  - ${e}`).join("\n")}`,
        );
      }

      if (routesCache) {
        console.log(pc.cyan(`[suamox:pages] Found ${routesCache.length} route(s)`));
        routesCache.forEach((route) => {
          const loaderInfo = route.hasLoader ? pc.green(" [has loader]") : "";
          console.log(pc.dim(`  ${route.path} -> ${route.filePath}${loaderInfo}`));
        });
      }
      if (apiRoutesCache.length > 0) {
        console.log(pc.cyan(`[suamox:pages] Found ${apiRoutesCache.length} API route(s)`));
        apiRoutesCache.forEach((route) => {
          const methods = route.httpMethods.join(", ");
          console.log(pc.dim(`  ${route.path} [${methods}] -> ${route.filePath}`));
        });
      }
    },

    resolveId(id, importer) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      if (id === VIRTUAL_SERVER_MODULE_ID) {
        return RESOLVED_VIRTUAL_SERVER_MODULE_ID;
      }

      // El stripping de server code solo aplica al bundle del cliente. Se
      // consulta el entorno actual (`this.environment.config.consumer`) en vez
      // de un `build.ssr` global capturado una vez: distingue client de ssr por
      // entorno y funciona igual en dev que en build.
      if (this.environment.config.consumer !== "client") {
        return;
      }

      // Bloquear imports de .server.ts/.server.tsx desde el cliente
      const cleanId = id.split("?")[0] ?? id;
      if (isServerFile(cleanId)) {
        const importerRel = importer ? importer.replace(/\\/g, "/") : "unknown";
        throw new Error(
          `[suamox:pages] Cannot import server-only file "${cleanId}" from client code (${importerRel}). ` +
            `Files matching *.server.{ts,tsx,js,jsx} are excluded from the client bundle.`,
        );
      }

      // Bloquear imports de src/api/ desde el cliente
      const absoluteApiDir = resolve(root, "src/api");
      if (cleanId.startsWith(absoluteApiDir.replace(/\\/g, "/"))) {
        const importerRel = importer ? importer.replace(/\\/g, "/") : "unknown";
        throw new Error(
          `[suamox:pages] Cannot import API route "${cleanId}" from client code (${importerRel}). ` +
            `API routes in src/api/ are server-only.`,
        );
      }

      // El middleware de directorio no pasa por el stripping —no es un archivo de
      // ruta— asi que una pagina que importe algo de el se llevaria el guardia,
      // y sus secretos, al bundle del navegador
      if (isMiddlewareModule(cleanId, root, pagesDir)) {
        const importerRel = importer ? importer.replace(/\\/g, "/") : "unknown";
        throw new Error(
          `[suamox:pages] Cannot import middleware "${cleanId}" from client code (${importerRel}). ` +
            `middleware.{ts,tsx,js,jsx} files are server-only.`,
        );
      }
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        if (!clientModuleCode) {
          await updateRoutes(false);
        }
        return clientModuleCode;
      }
      if (id === RESOLVED_VIRTUAL_SERVER_MODULE_ID) {
        if (!serverModuleCode) {
          await updateRoutes(false);
        }
        return serverModuleCode;
      }
    },

    transform(code, id) {
      // Solo aplicar a modulos con el query string del client route
      if (!id.includes(`?${CLIENT_ROUTE_QUERY}`)) return;

      // En este punto Vite ya transformo TSX/TS a JS. Se usa el parser Oxc de
      // Vite para operar sobre el AST del modulo ya transformado.
      const filePath = (id.split("?")[0] ?? id).replace(/\\/g, "/");

      const result = parseSync(filePath, code);

      // Fail-safe: si el codigo no parsea limpio no se puede garantizar que el
      // stripping de server code sea correcto, asi que se aborta el build.
      if (result.errors.length > 0) {
        this.error(
          `[suamox:pages] Failed to parse exports from "${filePath}". ` +
            `Cannot guarantee server code won't leak to the client bundle.\n` +
            `To fix this, you can:\n` +
            `  1. Move server-only imports to a *.server.ts file (automatically excluded from client)\n` +
            `  2. Check the file for syntax errors\n` +
            `Error: ${result.errors[0]?.message ?? "unknown parse error"}`,
        );
      }

      return stripServerExports(code, result.program, filePath) ?? undefined;
    },

    generateBundle(_options, bundle) {
      if (this.environment.config.consumer !== "client") return;

      const chunks: ChunkModules[] = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") continue;
        // `modules` es lo que se bundleo; `imports` recoge lo externalizado
        chunks.push({ fileName, ids: [...Object.keys(output.modules), ...output.imports] });
      }

      const leaks = findServerLeaks(
        chunks,
        resolve(root, "src/api"),
        resolve(root, pagesDir),
        globalMiddlewarePath,
      );
      if (leaks.length > 0) {
        this.error(formatLeakError(leaks, root));
      }
    },
  };
}

/** Detecta si un path corresponde a un archivo .server.{ts,tsx,js,jsx} */
function isServerFile(id: string): boolean {
  return /\.server\.(ts|tsx|js|jsx)$/.test(id);
}

/**
 * `middleware` es un nombre corriente —lo hay en node_modules y en cualquier
 * `src/lib/`—, asi que solo cuenta dentro de los directorios donde el framework
 * le da significado. Fuera de ahi es codigo de la app como cualquier otro.
 */
function isMiddlewareModule(id: string, root: string, pagesDir: string): boolean {
  const normalized = id.replace(/\\/g, "/");
  if (!/(^|\/)middleware\.(ts|tsx|js|jsx)$/.test(normalized)) {
    return false;
  }

  const asDir = (path: string): string => path.replace(/\\/g, "/").replace(/\/+$/, "") + "/";
  return [resolve(root, pagesDir), resolve(root, "src/api")].some((dir) =>
    normalized.startsWith(asDir(dir)),
  );
}

export default suamoxPages;
