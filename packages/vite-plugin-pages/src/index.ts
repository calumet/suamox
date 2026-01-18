import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import pc from 'picocolors';
import { scanRoutes } from './scanner.js';
import { generateRoutesModule } from './codegen.js';
import type { RouteRecord } from './types.js';

export interface SuamoxPagesOptions {
  pagesDir?: string;
  extensions?: string[];
}

export type { RouteRecord, RouteSegment, ParsedRoute } from './types.js';

const VIRTUAL_MODULE_ID = 'virtual:pages';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

export function suamoxPages(options: SuamoxPagesOptions = {}): Plugin {
  const { pagesDir = 'src/pages', extensions = ['.tsx', '.ts'] } = options;

  let server: ViteDevServer | undefined;
  let root: string;
  let routesCache: RouteRecord[] | null = null;
  let moduleCode: string | null = null;

  async function updateRoutes(logErrors = true): Promise<void> {
    const result = await scanRoutes({
      pagesDir,
      extensions,
      root,
    });

    routesCache = result.routes;
    moduleCode = generateRoutesModule(result.routes);

    if (logErrors && result.errors.length > 0) {
      console.error(pc.red('\n[suamox:pages] Route errors:'));
      result.errors.forEach((err) => {
        console.error(pc.red(`  - ${err}`));
      });
    }

    if (server) {
      const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
      if (module) {
        server.moduleGraph.invalidateModule(module);
        server.ws.send({
          type: 'full-reload',
          path: '*',
        });
      }
    }
  }

  return {
    name: 'suamox:pages',

    configResolved(config) {
      root = config.root;
    },

    configureServer(_server) {
      server = _server;

      // Watch pages directory for changes
      const absolutePagesDir = resolve(root, pagesDir);

      server.watcher.add(absolutePagesDir);

      server.watcher.on('add', (file) => {
        if (file.startsWith(absolutePagesDir) && extensions.some((ext) => file.endsWith(ext))) {
          console.log(pc.green(`[suamox:pages] Page added: ${file}`));
          void updateRoutes();
        }
      });

      server.watcher.on('unlink', (file) => {
        if (file.startsWith(absolutePagesDir) && extensions.some((ext) => file.endsWith(ext))) {
          console.log(pc.yellow(`[suamox:pages] Page removed: ${file}`));
          void updateRoutes();
        }
      });

      server.watcher.on('change', (file) => {
        if (file.startsWith(absolutePagesDir) && extensions.some((ext) => file.endsWith(ext))) {
          // File content changed but path is same - no need to regenerate routes
          // Just let Vite's normal HMR handle it
        }
      });
    },

    async buildStart() {
      await updateRoutes();

      if (routesCache) {
        console.log(pc.cyan(`[suamox:pages] Found ${routesCache.length} route(s)`));
        routesCache.forEach((route) => {
          console.log(pc.dim(`  ${route.path} -> ${route.filePath}`));
        });
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        if (!moduleCode) {
          await updateRoutes(false);
        }
        return moduleCode;
      }
    },
  };
}

export default suamoxPages;
