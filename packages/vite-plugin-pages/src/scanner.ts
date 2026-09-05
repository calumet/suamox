import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

import fg from "fast-glob";
import { parseSync } from "vite";

import { expandOptionalSegment, parseRoute, sortRoutes, validateRoutes } from "./parser.js";
import type { ApiRouteRecord, LayoutMeta, RouteRecord } from "./types.js";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

/**
 * Extrae los nombres de export de un modulo con el parser Oxc de Vite.
 *
 * Reemplaza a es-module-lexer, que solo lexa JS y fallaba en todos los .tsx
 * (cayendo siempre al fallback de regex). Oxc parsea TS/TSX nativamente y hace
 * error-recovery, asi que ni las anotaciones de tipo ni un `loader` dentro de un
 * comentario o string se confunden con un export real.
 *
 * Captura el nombre *exportado* (no el local), asi que `export { x as loader }`
 * y `export { loader } from "./m"` cuentan. Devuelve `null` solo si el parser
 * lanza (caso extremo); el caller usa entonces el fallback de regex.
 */
interface ModuleExports {
  names: Set<string>;
  /** `export const layout = false`: la pagina se sale de la cadena de layouts */
  layoutDisabled: boolean;
}

function parseExports(file: string, content: string): ModuleExports | null {
  try {
    const result = parseSync(file, content);
    const names = new Set<string>();
    for (const statement of result.module.staticExports) {
      for (const entry of statement.entries) {
        if (entry.exportName.name) {
          names.add(entry.exportName.name);
        }
      }
    }
    return { names, layoutDisabled: hasLayoutFalse(result.program.body) };
  } catch {
    return null;
  }
}

/**
 * Busca `export const layout = false`. El valor se lee aqui y no en tiempo de
 * ejecucion como `prerender` o `csr`, porque la cadena de layouts se resuelve
 * al generar el modulo de rutas.
 */
function hasLayoutFalse(body: ReturnType<typeof parseSync>["program"]["body"]): boolean {
  for (const node of body) {
    if (
      node.type !== "ExportNamedDeclaration" ||
      node.declaration?.type !== "VariableDeclaration"
    ) {
      continue;
    }

    for (const declarator of node.declaration.declarations) {
      if (
        declarator.id.type === "Identifier" &&
        declarator.id.name === "layout" &&
        declarator.init?.type === "Literal" &&
        declarator.init.value === false
      ) {
        return true;
      }
    }
  }

  return false;
}

const loaderExportPatterns = [
  /\bexport\s+(async\s+)?function\s+loader\b/,
  /\bexport\s+(const|let|var)\s+loader\b/,
  /\bexport\s*{\s*[^}]*\bloader\b[^}]*}/,
];

const getStaticPathsExportPatterns = [
  /\bexport\s+(async\s+)?function\s+getStaticPaths\b/,
  /\bexport\s+(const|let|var)\s+getStaticPaths\b/,
  /\bexport\s*{\s*[^}]*\bgetStaticPaths\b[^}]*}/,
];

const prerenderExportPatterns = [
  /\bexport\s+(const|let|var)\s+prerender\b/,
  /\bexport\s*{\s*[^}]*\bprerender\b[^}]*}/,
];

function fallbackHasLoader(content: string): boolean {
  return loaderExportPatterns.some((pattern) => pattern.test(content));
}

function fallbackHasGetStaticPaths(content: string): boolean {
  return getStaticPathsExportPatterns.some((pattern) => pattern.test(content));
}

function fallbackHasPrerender(content: string): boolean {
  return prerenderExportPatterns.some((pattern) => pattern.test(content));
}

function fallbackLayoutDisabled(content: string): boolean {
  return /\bexport\s+const\s+layout\s*(?::[^=]+)?=\s*false\b/.test(content);
}

function isLayoutFile(filePath: string, extensions: string[]): boolean {
  const matchedExtension = extensions.find((extension) => filePath.endsWith(extension));
  if (!matchedExtension) {
    return false;
  }

  return basename(filePath, matchedExtension) === "layout";
}

/** Solo cuenta en la raiz de `pages/`; un `root.tsx` anidado es una pagina normal */
function isRootFile(filePath: string, extensions: string[], pagesDir: string): boolean {
  const matchedExtension = extensions.find((extension) => filePath.endsWith(extension));
  if (!matchedExtension) {
    return false;
  }

  return basename(filePath, matchedExtension) === "root" && dirname(filePath) === pagesDir;
}

/** No es `layout:root`: ese lo ocupa `src/pages/layout.tsx` */
export const ROOT_ROUTE_ID = "root";

/**
 * Genera un route ID para un layout basado en su ruta relativa al pages dir.
 * Ej: src/pages/[lang]/layout.tsx → "layout:[lang]"
 *     src/pages/layout.tsx → "layout:root"
 *     src/pages/(admin)/layout.tsx → "layout:(admin)"
 */
function layoutRouteId(layoutFile: string, pagesDir: string): string {
  const rel = relative(pagesDir, dirname(layoutFile)).replace(/\\/g, "/");
  return rel === "" ? "layout:root" : `layout:${rel}`;
}

function collectLayoutsForFile(
  filePath: string,
  layoutMap: Map<string, string>,
  pagesDir: string,
): string[] {
  const layouts: string[] = [];
  let currentDir = dirname(filePath);

  while (true) {
    const layoutFile = layoutMap.get(currentDir);
    if (layoutFile) {
      layouts.push(layoutFile);
    }

    if (currentDir === pagesDir) {
      break;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return layouts.reverse();
}

function collectLayoutMetasForFile(
  filePath: string,
  layoutMap: Map<string, string>,
  layoutLoaderMap: Map<string, boolean>,
  pagesDir: string,
): LayoutMeta[] {
  const metas: LayoutMeta[] = [];
  let currentDir = dirname(filePath);

  while (true) {
    const layoutFile = layoutMap.get(currentDir);
    if (layoutFile) {
      metas.push({
        filePath: layoutFile,
        routeId: layoutRouteId(layoutFile, pagesDir),
        hasLoader: layoutLoaderMap.get(layoutFile) ?? false,
      });
    }

    if (currentDir === pagesDir) {
      break;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return metas.reverse();
}

export interface ScanOptions {
  pagesDir: string;
  extensions: string[];
  root?: string;
}

export interface ScanResult {
  routes: RouteRecord[];
  apiRoutes: ApiRouteRecord[];
  errors: string[];
  hasMiddleware: boolean;
  middlewarePath?: string;
}

/**
 * Escanea el directorio de páginas y genera registros de rutas
 */
export async function scanRoutes(options: ScanOptions): Promise<ScanResult> {
  const { pagesDir, extensions, root = process.cwd() } = options;
  const absolutePagesDir = resolve(root, pagesDir);

  // Construir patrón glob
  const extPattern = extensions.length === 1 ? extensions[0] : `{${extensions.join(",")}}`;
  const pattern = `**/*${extPattern}`;

  // Escanear archivos
  const files = await fg(pattern, {
    cwd: absolutePagesDir,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  const rootFile = files.find((file) => isRootFile(file, extensions, absolutePagesDir));
  const layoutFiles = files.filter((file) => isLayoutFile(file, extensions));
  const pageFiles = files.filter((file) => !isLayoutFile(file, extensions) && file !== rootFile);
  const layoutMap = new Map<string, string>();
  const layoutLoaderMap = new Map<string, boolean>();

  for (const layoutFile of layoutFiles) {
    layoutMap.set(dirname(layoutFile), layoutFile);
  }

  // Detectar loaders en layout files y en el root
  await Promise.all(
    [...layoutFiles, ...(rootFile ? [rootFile] : [])].map(async (file) => {
      const content = await readFile(file, "utf-8");
      const exports = parseExports(file, content);
      layoutLoaderMap.set(file, exports ? exports.names.has("loader") : fallbackHasLoader(content));
    }),
  );

  const rootMeta: LayoutMeta | null = rootFile
    ? {
        filePath: rootFile,
        routeId: ROOT_ROUTE_ID,
        hasLoader: layoutLoaderMap.get(rootFile) ?? false,
      }
    : null;

  const errors: string[] = [];
  const parsedRoutes = await Promise.all(
    pageFiles.map(async (file): Promise<RouteRecord[]> => {
      const { route, errors: parseErrors } = parseRoute(file, absolutePagesDir);

      if (parseErrors.length > 0) {
        errors.push(...parseErrors.map((err) => `${file}: ${err}`));
      }

      // Detectar loader / getStaticPaths / prerender / layout via AST (Oxc).
      const content = await readFile(file, "utf-8");
      const exports = parseExports(file, content);
      const layoutDisabled = exports ? exports.layoutDisabled : fallbackLayoutDisabled(content);

      // El root envuelve siempre: `layout = false` se salta los layout.tsx, no la app
      const chain = layoutDisabled ? [] : collectLayoutsForFile(file, layoutMap, absolutePagesDir);
      const metas = layoutDisabled
        ? []
        : collectLayoutMetasForFile(file, layoutMap, layoutLoaderMap, absolutePagesDir);

      route.layouts = rootFile ? [rootFile, ...chain] : chain;
      route.layoutMetas = rootMeta ? [rootMeta, ...metas] : metas;

      if (exports) {
        route.hasLoader = exports.names.has("loader");
        route.hasGetStaticPaths = exports.names.has("getStaticPaths");
        route.hasPrerender = exports.names.has("prerender");
      } else {
        route.hasLoader = fallbackHasLoader(content);
        route.hasGetStaticPaths = fallbackHasGetStaticPaths(content);
        route.hasPrerender = fallbackHasPrerender(content);
      }

      return expandOptionalSegment(route);
    }),
  );
  const routes = parsedRoutes.flat();

  // Validar rutas
  const validationErrors = validateRoutes(routes);
  errors.push(...validationErrors);

  // Ordenar rutas por prioridad
  const sortedRoutes = sortRoutes(routes);

  // Escanear API routes en src/api/
  const srcDir = resolve(absolutePagesDir, "..");
  const apiDir = resolve(srcDir, "api");
  const apiRoutes: ApiRouteRecord[] = [];

  try {
    await access(apiDir);
    const apiFiles = await fg(pattern, {
      cwd: apiDir,
      absolute: true,
      ignore: ["**/node_modules/**", "**/.git/**"],
    });

    for (const file of apiFiles) {
      const { route: parsedApiRoute, errors: parseErrors } = parseRoute(file, apiDir);
      if (parseErrors.length > 0) {
        errors.push(...parseErrors.map((err) => `${file}: ${err}`));
      }

      // Detectar metodos HTTP exportados
      const content = await readFile(file, "utf-8");
      const exports = parseExports(file, content);
      const httpMethods = exports
        ? HTTP_METHODS.filter((method) => exports.names.has(method))
        : HTTP_METHODS.filter((method) =>
            new RegExp(`\\bexport\\s+(async\\s+)?function\\s+${method}\\b`).test(content),
          );

      for (const route of expandOptionalSegment(parsedApiRoute)) {
        // Prefixar la ruta con /api
        const apiPath = route.path === "/" ? "/api" : `/api${route.path}`;

        apiRoutes.push({
          path: apiPath,
          filePath: route.filePath,
          type: "api",
          httpMethods,
          params: route.params,
          isCatchAll: route.isCatchAll,
          isIndex: route.isIndex,
          priority: route.priority,
        });
      }
    }
  } catch {
    // src/api/ no existe, no hay API routes
  }

  // Detectar middleware global (src/middleware.ts o src/middleware/index.ts)
  let hasMiddleware = false;
  let middlewarePath: string | undefined;
  for (const ext of extensions) {
    const candidate = resolve(srcDir, `middleware${ext}`);
    try {
      await access(candidate);
      hasMiddleware = true;
      middlewarePath = candidate.replace(/\\/g, "/");
      break;
    } catch {
      // no existe, continuar
    }
  }
  if (!hasMiddleware) {
    for (const ext of extensions) {
      const candidate = resolve(srcDir, "middleware", `index${ext}`);
      try {
        await access(candidate);
        hasMiddleware = true;
        middlewarePath = candidate.replace(/\\/g, "/");
        break;
      } catch {
        // no existe, continuar
      }
    }
  }

  return {
    routes: sortedRoutes,
    apiRoutes,
    errors,
    hasMiddleware,
    middlewarePath,
  };
}
