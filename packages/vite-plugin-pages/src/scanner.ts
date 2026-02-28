import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { init, parse } from "es-module-lexer";
import fg from "fast-glob";

import { parseRoute, sortRoutes, validateRoutes } from "./parser.js";
import type { RouteRecord } from "./types.js";

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

function isLayoutFile(filePath: string, extensions: string[]): boolean {
  const matchedExtension = extensions.find((extension) => filePath.endsWith(extension));
  if (!matchedExtension) {
    return false;
  }

  return basename(filePath, matchedExtension) === "layout";
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

export interface ScanOptions {
  pagesDir: string;
  extensions: string[];
  root?: string;
}

export interface ScanResult {
  routes: RouteRecord[];
  errors: string[];
}

/**
 * Escanea el directorio de páginas y genera registros de rutas
 */
export async function scanRoutes(options: ScanOptions): Promise<ScanResult> {
  const { pagesDir, extensions, root = process.cwd() } = options;
  const absolutePagesDir = resolve(root, pagesDir);

  // Inicializar es-module-lexer (solo se hace una vez)
  await init;

  // Construir patrón glob
  const extPattern = extensions.length === 1 ? extensions[0] : `{${extensions.join(",")}}`;
  const pattern = `**/*${extPattern}`;

  // Escanear archivos
  const files = await fg(pattern, {
    cwd: absolutePagesDir,
    absolute: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });

  const layoutFiles = files.filter((file) => isLayoutFile(file, extensions));
  const pageFiles = files.filter((file) => !isLayoutFile(file, extensions));
  const layoutMap = new Map<string, string>();

  for (const layoutFile of layoutFiles) {
    layoutMap.set(dirname(layoutFile), layoutFile);
  }

  const errors: string[] = [];
  const routes = await Promise.all(
    pageFiles.map(async (file): Promise<RouteRecord> => {
      const { route, errors: parseErrors } = parseRoute(file, absolutePagesDir);

      if (parseErrors.length > 0) {
        errors.push(...parseErrors.map((err) => `${file}: ${err}`));
      }

      route.layouts = collectLayoutsForFile(file, layoutMap, absolutePagesDir);

      // Verificar exports con es-module-lexer cuando el archivo sea parseable como ESM.
      let content = "";
      try {
        content = await readFile(file, "utf-8");
        const [, exports] = parse(content);
        route.hasLoader = exports.some((exp) => exp.n === "loader");
        route.hasGetStaticPaths = exports.some((exp) => exp.n === "getStaticPaths");
        route.hasPrerender = exports.some((exp) => exp.n === "prerender");
      } catch {
        route.hasLoader = fallbackHasLoader(content);
        route.hasGetStaticPaths = fallbackHasGetStaticPaths(content);
        route.hasPrerender = fallbackHasPrerender(content);
      }

      return route;
    }),
  );

  // Validar rutas
  const validationErrors = validateRoutes(routes);
  errors.push(...validationErrors);

  // Ordenar rutas por prioridad
  const sortedRoutes = sortRoutes(routes);

  return {
    routes: sortedRoutes,
    errors,
  };
}
