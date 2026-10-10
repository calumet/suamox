import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import pc from "picocolors";
import { parseSync, type Plugin, type ViteDevServer } from "vite";

import {
  ACTIONS_CLIENT_MODULE_ID,
  actionId,
  collectActionExports,
  generateActionStubs,
  generateActionsCode,
  isActionsFile,
  referencedActionIds,
  type ActionEntry,
} from "./actions.js";
import { CLIENT_ROUTE_QUERY, generateRoutesModule, type DefaultPageMode } from "./codegen.js";
import { scanRoutes } from "./scanner.js";
import { stripServerExports } from "./strip-server-exports.js";
import type { ApiRouteRecord, RouteRecord } from "./types.js";
import { findServerLeaks, formatLeakError, type ChunkModules } from "./validator.js";

export interface SuamoxPagesOptions {
  pagesDir?: string;
  extensions?: string[];
  defaultMode?: DefaultPageMode;
  /** Fuentes del CSS de cada ruta que se precargan, por nombre de archivo. Solo en build */
  preloadFonts?: RegExp;
  /**
   * Trata como acciones los `*.actions.*` de `node_modules`. Apagado por defecto: Redux y
   * NgRx usan el mismo nombre, y cada export pasaría a ser un endpoint
   */
  actionsInDependencies?: boolean;
}

export type { RouteRecord, RouteSegment, ParsedRoute } from "./types.js";

const VIRTUAL_MODULE_ID = "virtual:pages";
const RESOLVED_VIRTUAL_MODULE_ID = "\0" + VIRTUAL_MODULE_ID;

const VIRTUAL_SERVER_MODULE_ID = "virtual:pages/server";
const RESOLVED_VIRTUAL_SERVER_MODULE_ID = "\0" + VIRTUAL_SERVER_MODULE_ID;

const VIRTUAL_CLIENT_ENTRY_ID = "virtual:pages/client-entry";
const RESOLVED_VIRTUAL_CLIENT_ENTRY_ID = "\0" + VIRTUAL_CLIENT_ENTRY_ID;

const RESOLVED_ACTIONS_CLIENT_MODULE_ID = "\0" + ACTIONS_CLIENT_MODULE_ID;
const ACTIONS_CLIENT_MODULE_CODE = `export { createAction } from "@calumet/suamox-router";\n`;

/** Lo escribe el build del cliente, que es el que ve cada acción, y lo lee el del servidor */
const ACTIONS_MANIFEST = ".vite/actions.json";

/** Lo que el adaptador de desarrollo le pide al plugin para resolver `/__actions/:id` */
export interface SuamoxPagesApi {
  /** `file` relativo a la raíz, para el middleware; `path` absoluto, para cargarlo */
  resolveAction(id: string): { file: string; path: string; name: string } | undefined;
}

/** Gancho opcional de la aplicacion, para lo que tenga que correr antes de hidratar */
const CLIENT_HOOK_FILE = "src/client.ts";

export { CLIENT_ROUTE_QUERY } from "./codegen.js";

export function suamoxPages(options: SuamoxPagesOptions = {}): Plugin {
  const { pagesDir = "src/pages", extensions = [".tsx", ".ts"], defaultMode = "ssr" } = options;

  let server: ViteDevServer | undefined;
  let root: string;
  let basePath = "/";
  let clientOutDir = "";
  let routesCache: RouteRecord[] | null = null;
  let fatalErrors: string[] = [];
  let globalMiddlewarePath: string | undefined;
  let apiRoutesCache: ApiRouteRecord[] = [];
  let clientModuleCode: string | null = null;
  let serverModuleCode: string | null = null;
  const actions = new Map<string, ActionEntry>();
  // Una por proceso: los ids viajan del build del cliente al del servidor por el manifiesto.
  // Fija con la variable cuando varias réplicas se construyen por separado
  const actionsKey = process.env.SUAMOX_ACTIONS_KEY || randomBytes(32).toString("hex");

  // El manifiesto va junto al de Vite, fuera del directorio que se sirve
  const actionsManifestPath = () => resolve(clientOutDir, "..", ACTIONS_MANIFEST);

  const isActionModule = (path: string): boolean =>
    isActionsFile(path) &&
    (options.actionsInDependencies === true ||
      !path.replace(/\\/g, "/").includes("/node_modules/"));

  function registerActions(
    code: string,
    absolutePath: string,
  ): Array<{ id: string; name: string }> {
    const file = relative(root, absolutePath).replace(/\\/g, "/");
    return collectActionExports(code, absolutePath).map((name) => {
      const id = actionId(file, name, actionsKey);
      actions.set(id, { file, name });
      return { id, name };
    });
  }

  // `?raw`, `?url` y compañía emiten el archivo tal cual: no pasan por el stub de `load`
  function rejectQueriedActions(this: { error: (message: string) => never }, id: string): void {
    const cleanPath = (id.split("?")[0] ?? id).replace(/\\/g, "/");
    if (id.includes("?") && isActionModule(cleanPath)) {
      this.error(
        `[suamox:pages] Cannot import actions file "${cleanPath}" with a query from client code. ` +
          `Its source would reach the browser as is.`,
      );
    }
  }

  /**
   * En `load` y no en `transform`: el bundler toma el `sourcesContent` de los mapas de lo
   * que devuelve `load`, así que reemplazar después dejaría el original en el `.map`
   */
  const loadActionStub = {
    order: "pre" as const,
    handler(this: { error: (message: string) => never }, id: string): string | undefined {
      if (id.includes("?") || !isActionModule(id)) return;
      try {
        return generateActionStubs(registerActions(readFileSync(id, "utf-8"), id));
      } catch (error) {
        this.error((error as Error).message);
      }
    },
  };

  /**
   * Quita los exports de servidor de una página antes de que el bundler vea el original.
   * Por la misma razón que las acciones: en `transform` el fuente completo, `loader`
   * incluido, quedaba en el `sourcesContent` del mapa que se sirve.
   */
  function loadClientRoute(this: { error: (message: string) => never }, id: string) {
    const filePath = (id.split("?")[0] ?? id).replace(/\\/g, "/");
    const source = readFileSync(filePath, "utf-8");
    const result = parseSync(filePath, source);

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

    // Sin mapa: el código devuelto pasa a ser el original de los mapas siguientes
    return stripServerExports(source, result.program, filePath)?.code ?? source;
  }

  function serverActionsCode(): string {
    const path = actionsManifestPath();
    if (!existsSync(path)) return "";
    return generateActionsCode(
      JSON.parse(readFileSync(path, "utf-8")) as Record<string, ActionEntry>,
      root,
    );
  }

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
      rerouteHasVariants: result.rerouteHasVariants,
      apiRoutes: result.apiRoutes,
      preloadFonts: options.preloadFonts,
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

  /**
   * Sin esto, un escaneo fallido dejaba servida la tabla anterior: anades un
   * `middleware.ts`, el rescan revienta, y el dev sigue sirviendo sin guardia
   * mientras en consola ya salio el "Page added". Se tiran las caches para que el
   * siguiente `load()` reescanee, y si vuelve a fallar el error sale por el overlay.
   */
  function onScanFailure(error: unknown): void {
    console.error(pc.red(`[suamox:pages] Route scan failed: ${String(error)}`));
    routesCache = null;
    clientModuleCode = null;
    serverModuleCode = null;

    if (!server) {
      return;
    }
    for (const environment of Object.values(server.environments)) {
      for (const id of [RESOLVED_VIRTUAL_MODULE_ID, RESOLVED_VIRTUAL_SERVER_MODULE_ID]) {
        const mod = environment.moduleGraph.getModuleById(id);
        if (mod) {
          environment.moduleGraph.invalidateModule(mod);
        }
      }
    }
    server.environments.client.hot.send({ type: "full-reload", path: "*" });
  }

  const api: SuamoxPagesApi = {
    resolveAction(id) {
      const entry = actions.get(id);
      return entry
        ? { file: entry.file, path: resolve(root, entry.file), name: entry.name }
        : undefined;
    },
  };

  return {
    name: "suamox:pages",
    api,

    // Las entradas las declara el plugin, no la aplicacion: son las mismas en
    // todos los proyectos y su contenido lo genera este mismo plugin. La CLI de
    // Vite no sirve para esto porque resuelve `--ssr <entrada>` como ruta de
    // archivo y un id virtual no lo es.
    config(_config, env) {
      // El nombre de la clave decide el del archivo emitido, y `entry-server.js`
      // es el que ya buscan el adaptador y SSG por defecto
      const input: Record<string, string> = env.isSsrBuild
        ? { "entry-server": VIRTUAL_SERVER_MODULE_ID }
        : { "entry-client": VIRTUAL_CLIENT_ENTRY_ID };
      return {
        build: { rollupOptions: { input } },
        // Vite no aplica los plugins de la app al bundle de un worker: sin esto, un worker
        // que importe una acción se llevaría el módulo real al navegador
        worker: {
          plugins: () => [
            {
              name: "suamox:pages-worker-actions",
              resolveId: (id: string) =>
                id === ACTIONS_CLIENT_MODULE_ID ? RESOLVED_ACTIONS_CLIENT_MODULE_ID : undefined,
              load: {
                order: "pre" as const,
                handler(this: { error: (message: string) => never }, id: string) {
                  return id === RESOLVED_ACTIONS_CLIENT_MODULE_ID
                    ? ACTIONS_CLIENT_MODULE_CODE
                    : loadActionStub.handler.call(this, id);
                },
              },
              transform(this: { error: (message: string) => never }, _code: string, id: string) {
                rejectQueriedActions.call(this, id);
              },
            },
          ],
        },
      };
    },

    configResolved(config) {
      root = config.root;
      basePath = config.base.replace(/\/+$/, "") || "/";
      clientOutDir = resolve(root, config.build.outDir);
    },

    // El manifest sale del directorio que se sirve. Dentro queda expuesto por
    // HTTP, y con el los paths de todas las fuentes: el inventario de rutas,
    // incluidas las que nadie enlaza
    writeBundle(_options, bundle) {
      if (this.environment.config.consumer !== "client") return;

      // Solo las acciones cuyo id quedó en el bundle: un export que nadie importa no tiene
      // por qué ser un endpoint. Los workers llegan aquí como assets
      const emitted = Object.values(bundle)
        .map((output) =>
          output.type === "chunk"
            ? output.code
            : output.fileName.endsWith(".js")
              ? String(output.source)
              : "",
        )
        .join("\n");
      const referenced = referencedActionIds(emitted, actions.keys());
      const manifest = Object.fromEntries([...actions].filter(([id]) => referenced.has(id)));

      // Siempre, aunque quede vacío: uno viejo le daría al servidor acciones que ya no existen
      mkdirSync(dirname(actionsManifestPath()), { recursive: true });
      writeFileSync(actionsManifestPath(), JSON.stringify(manifest));

      const origen = resolve(clientOutDir, ".vite", "manifest.json");
      if (!existsSync(origen)) return;

      const destino = resolve(clientOutDir, "..", ".vite", "manifest.json");
      mkdirSync(dirname(destino), { recursive: true });
      renameSync(origen, destino);
      rmSync(dirname(origen), { recursive: true, force: true });
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
          void updateRoutes().catch(onScanFailure);
        }
      });

      server.watcher.on("unlink", (file) => {
        if (isWatchedFile(file)) {
          const type = file.startsWith(absoluteApiDir) ? "API route" : "Page";
          console.log(pc.yellow(`[suamox:pages] ${type} removed: ${file}`));
          void updateRoutes().catch(onScanFailure);
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
      if (id === VIRTUAL_CLIENT_ENTRY_ID) {
        return RESOLVED_VIRTUAL_CLIENT_ENTRY_ID;
      }
      // Virtual para que el stub resuelva el router desde la app: un `*.actions.ts` de otro
      // paquete del workspace no tiene por qué declararlo
      if (id === ACTIONS_CLIENT_MODULE_ID) {
        return RESOLVED_ACTIONS_CLIENT_MODULE_ID;
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

    load: {
      order: "pre",
      async handler(id) {
        if (this.environment.config.consumer === "client") {
          const stub = loadActionStub.handler.call(this, id);
          if (stub !== undefined) return stub;
          if (id.includes(`?${CLIENT_ROUTE_QUERY}`)) return loadClientRoute.call(this, id);
        }
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
          // En dev la tabla no va en el módulo: el adaptador le pregunta al plugin
          return server ? serverModuleCode : `${serverModuleCode ?? ""}${serverActionsCode()}`;
        }
        if (id === RESOLVED_ACTIONS_CLIENT_MODULE_ID) {
          return ACTIONS_CLIENT_MODULE_CODE;
        }
        if (id === RESOLVED_VIRTUAL_CLIENT_ENTRY_ID) {
          // El gancho va primero: los efectos de un import corren en orden, y lo
          // que ponga la aplicacion ahi tiene que verse antes de que hidrate
          const hook = existsSync(resolve(root, CLIENT_HOOK_FILE))
            ? `import ${JSON.stringify("/" + CLIENT_HOOK_FILE)};\n`
            : "";
          return (
            `${hook}import { startRouter } from "@calumet/suamox-router";\n` +
            `import { routes } from ${JSON.stringify(VIRTUAL_MODULE_ID)};\n` +
            `void startRouter({ routes });\n`
          );
        }
      },
    },

    transform(code, id) {
      const cleanPath = (id.split("?")[0] ?? id).replace(/\\/g, "/");
      if (!isActionModule(cleanPath)) return;

      if (this.environment.config.consumer === "client") {
        rejectQueriedActions.call(this, id);
        return;
      }
      // En dev el SSR puede ver el archivo antes que el navegador, y el adaptador lo busca aquí
      try {
        registerActions(code, cleanPath);
      } catch (error) {
        this.error((error as Error).message);
      }
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
