import { resolve } from "node:path";

import { init, parse } from "es-module-lexer";
import pc from "picocolors";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

import { generateClientProxy, generateRoutesModule, type DefaultPageMode } from "./codegen.js";
import { scanRoutes } from "./scanner.js";
import type { RouteRecord } from "./types.js";

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
  let resolvedConfig: ResolvedConfig;
  let basePath = "/";
  let routesCache: RouteRecord[] | null = null;
  let clientModuleCode: string | null = null;
  let serverModuleCode: string | null = null;

  async function updateRoutes(logErrors = true): Promise<void> {
    const result = await scanRoutes({
      pagesDir,
      extensions,
      root,
    });

    routesCache = result.routes;
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
    });

    if (logErrors && result.errors.length > 0) {
      console.error(pc.red("\n[suamox:pages] Route errors:"));
      result.errors.forEach((err) => {
        console.error(pc.red(`  - ${err}`));
      });
    }

    if (server) {
      const clientModule = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
      if (clientModule) {
        server.moduleGraph.invalidateModule(clientModule);
      }
      const serverModule = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_SERVER_MODULE_ID);
      if (serverModule) {
        server.moduleGraph.invalidateModule(serverModule);
      }
      if (clientModule || serverModule) {
        server.ws.send({
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
      resolvedConfig = config;
      basePath = config.base.replace(/\/+$/, "") || "/";
    },

    configureServer(_server) {
      server = _server;

      // Observar cambios en el directorio de paginas
      const absolutePagesDir = resolve(root, pagesDir);

      server.watcher.add(absolutePagesDir);

      server.watcher.on("add", (file) => {
        if (file.startsWith(absolutePagesDir) && extensions.some((ext) => file.endsWith(ext))) {
          console.log(pc.green(`[suamox:pages] Page added: ${file}`));
          void updateRoutes();
        }
      });

      server.watcher.on("unlink", (file) => {
        if (file.startsWith(absolutePagesDir) && extensions.some((ext) => file.endsWith(ext))) {
          console.log(pc.yellow(`[suamox:pages] Page removed: ${file}`));
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
    },

    resolveId(id, importer) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      if (id === VIRTUAL_SERVER_MODULE_ID) {
        return RESOLVED_VIRTUAL_SERVER_MODULE_ID;
      }

      // Bloquear imports de .server.ts/.server.tsx en build del cliente
      const cleanId = id.split("?")[0] ?? id;
      if (!resolvedConfig.build.ssr && isServerFile(cleanId)) {
        const importerRel = importer ? importer.replace(/\\/g, "/") : "unknown";
        throw new Error(
          `[suamox:pages] Cannot import server-only file "${cleanId}" from client code (${importerRel}). ` +
            `Files matching *.server.{ts,tsx,js,jsx} are excluded from the client bundle.`,
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

    async transform(code, id) {
      // Solo aplicar a modulos con el query string del client route
      if (!id.includes(`?${CLIENT_ROUTE_QUERY}`)) return;

      // En este punto Vite ya transformo TSX/TS a JS, asi que es-module-lexer funciona
      const filePath = (id.split("?")[0] ?? id).replace(/\\/g, "/");

      await init;

      try {
        const [, exports] = parse(code);
        const exportNames = exports.map((exp) => exp.n).filter((n): n is string => n != null);

        const proxy = generateClientProxy(filePath, exportNames);
        if (proxy) {
          return {
            code: proxy,
            map: null,
          };
        }
      } catch (err) {
        this.error(
          `[suamox:pages] Failed to parse exports from "${filePath}". ` +
            `Cannot guarantee server code won't leak to the client bundle.\n` +
            `To fix this, you can:\n` +
            `  1. Move server-only imports to a *.server.ts file (automatically excluded from client)\n` +
            `  2. Check the file for syntax errors\n` +
            `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}

/** Detecta si un path corresponde a un archivo .server.{ts,tsx,js,jsx} */
function isServerFile(id: string): boolean {
  return /\.server\.(ts|tsx|js|jsx)$/.test(id);
}

export default suamoxPages;
