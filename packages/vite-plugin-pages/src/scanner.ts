import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import fg from 'fast-glob';
import { init, parse } from 'es-module-lexer';
import type { RouteRecord } from './types.js';
import { parseRoute, sortRoutes, validateRoutes } from './parser.js';

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
 * Scan the pages directory and generate route records
 */
export async function scanRoutes(options: ScanOptions): Promise<ScanResult> {
  const { pagesDir, extensions, root = process.cwd() } = options;
  const absolutePagesDir = resolve(root, pagesDir);

  // Initialize es-module-lexer (only needs to be done once)
  await init;

  // Build glob pattern
  const extPattern = extensions.length === 1 ? extensions[0] : `{${extensions.join(',')}}`;
  const pattern = `**/*${extPattern}`;

  // Scan files
  const files = await fg(pattern, {
    cwd: absolutePagesDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/.git/**'],
  });

  // Parse each file into a route
  const routes: RouteRecord[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const { route, errors: parseErrors } = parseRoute(file, absolutePagesDir);

    if (parseErrors.length > 0) {
      errors.push(...parseErrors.map((err) => `${file}: ${err}`));
    }

    // Check if the file exports a loader function using es-module-lexer
    try {
      const content = readFileSync(file, 'utf-8');
      const [, exports] = parse(content);
      route.hasLoader = exports.some((exp) => exp.n === 'loader');
    } catch {
      route.hasLoader = false;
    }

    routes.push(route);
  }

  // Validate routes
  const validationErrors = validateRoutes(routes);
  errors.push(...validationErrors);

  // Sort routes by priority
  const sortedRoutes = sortRoutes(routes);

  return {
    routes: sortedRoutes,
    errors,
  };
}
