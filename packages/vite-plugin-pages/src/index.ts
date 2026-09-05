import { resolve } from "node:path";

import pc from "picocolors";
import { parseSync, type Plugin, type ViteDevServer } from "vite";

import { generateRoutesModule, type DefaultPageMode } from "./codegen.js";
import { scanRoutes } from "./scanner.js";
import { stripServerExports } from "./strip-server-exports.js";
import type { ApiRouteRecord, RouteRecord } from "./types.js";

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

/** Query string que el codegen agrega a los imports del cliente para activar el stripping */
export const CLIENT_ROUTE_QUERY = "__suamox-client-route";

export function suamoxPages(options: SuamoxPagesOptions = {}): Plugin {
  const { pagesDir = "src/pages", extensions = [".tsx", ".ts"], defaultMode = "ssr" } = options;

  let server: ViteDevServer | undefined;
  let root: string;
  let basePath = "/";
  let routesCache: RouteRecord[] | null = null;
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
    apiRoutesCache = result.apiRoutes;
    clientModuleCode = generateRoutesModule(result.routes, {
      defaultMode,
      base: basePath,
      target: "client",
    });
    serverModuleCode = generateRoutesModule(result.routes, {
      defaultMode,
      base: basePath,
      target: "server",
      hasMiddleware: result.hasMiddleware,
      middlewarePath: result.middlewarePath,
      apiRoutes: result.apiRoutes,
    });

    if (logErrors && result.errors.length > 0) {
      console.error(pc.red("\n[suamox:pages] Route errors:"));
      result.errors.forEach((err) => {
        console.error(pc.red(`  - ${err}`));
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
          void updateRoutes();
        }
      });

      server.watcher.on("unlink", (file) => {
        if (isWatchedFile(file)) {
          const type = file.startsWith(absoluteApiDir) ? "API route" : "Page";
          console.log(pc.yellow(`[suamox:pages] ${type} removed: ${file}`));
          void updateRoutes();
        }
      });
    },

    async buildStart() {
      await updateRoutes();

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
  };
}

/** Detecta si un path corresponde a un archivo .server.{ts,tsx,js,jsx} */
function isServerFile(id: string): boolean {
  return /\.server\.(ts|tsx|js|jsx)$/.test(id);
}

export default suamoxPages;
