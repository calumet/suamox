import { relative, sep } from 'node:path';
import type { RouteRecord, RouteSegment, ParsedRoute } from './types.js';

/**
 * Parse a file path into a route record
 * @param filePath - Absolute path to the page file
 * @param pagesDir - Absolute path to the pages directory
 * @returns Parsed route with potential errors
 */
export function parseRoute(filePath: string, pagesDir: string): ParsedRoute {
  const errors: string[] = [];
  const relativePath = relative(pagesDir, filePath);

  // Remove extension
  const withoutExt = relativePath.replace(/\.(tsx?|jsx?)$/, '');

  // Split into segments
  const parts = withoutExt.split(sep).filter(Boolean);

  // Process segments
  const segments: RouteSegment[] = [];
  const params: string[] = [];
  const pathParts: string[] = [];
  let isCatchAll = false;
  let isIndex = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;

    // Remove route groups (admin) -> don't add to path
    if (part.startsWith('(') && part.endsWith(')')) {
      continue;
    }

    // Handle index files
    if (part === 'index') {
      isIndex = true;
      continue;
    }

    // Handle catch-all [...param]
    if (part.startsWith('[...') && part.endsWith(']')) {
      const paramName = part.slice(4, -1);
      if (!paramName) {
        errors.push(`Invalid catch-all segment: ${part}`);
        continue;
      }

      segments.push({
        type: 'catchAll',
        value: '*',
        paramName,
      });
      params.push(paramName);
      pathParts.push('*');
      isCatchAll = true;

      // Catch-all must be the last segment
      if (i !== parts.length - 1) {
        errors.push('Catch-all parameter must be the last segment');
      }
      continue;
    }

    // Handle dynamic params [param]
    if (part.startsWith('[') && part.endsWith(']')) {
      const paramName = part.slice(1, -1);
      if (!paramName) {
        errors.push(`Invalid parameter segment: ${part}`);
        continue;
      }

      segments.push({
        type: 'param',
        value: `:${paramName}`,
        paramName,
      });
      params.push(paramName);
      pathParts.push(`:${paramName}`);
      continue;
    }

    // Static segment
    segments.push({
      type: 'static',
      value: part,
    });
    pathParts.push(part);
  }

  // Build final path
  const path = '/' + pathParts.join('/');

  // Calculate priority (higher = matched first)
  // Static segments have highest priority, then params, then catch-all
  // Deeper routes have higher priority
  const priority = calculatePriority(segments);

  const route: RouteRecord = {
    path,
    filePath,
    params,
    isCatchAll,
    isIndex,
    segments,
    priority,
  };

  return { route, errors };
}

/**
 * Calculate route priority for sorting
 * Higher priority routes are matched first
 */
function calculatePriority(segments: RouteSegment[]): number {
  let priority = 0;

  // Depth contributes to priority (more specific routes first)
  priority += segments.length * 100;

  // Static segments add more priority
  for (const segment of segments) {
    if (segment.type === 'static') {
      priority += 10;
    } else if (segment.type === 'param') {
      priority += 5;
    } else if (segment.type === 'catchAll') {
      priority += 1;
    }
  }

  return priority;
}

/**
 * Sort routes by priority (highest first)
 */
export function sortRoutes(routes: RouteRecord[]): RouteRecord[] {
  return [...routes].sort((a, b) => {
    // Higher priority first
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    // If same priority, sort alphabetically for consistency
    return a.path.localeCompare(b.path);
  });
}

/**
 * Validate routes and return unique errors
 */
export function validateRoutes(routes: RouteRecord[]): string[] {
  const errors: string[] = [];
  const pathMap = new Map<string, RouteRecord>();

  for (const route of routes) {
    // Check for duplicate paths
    const existing = pathMap.get(route.path);
    if (existing) {
      errors.push(
        `Duplicate route path: ${route.path}\n` +
          `  - ${existing.filePath}\n` +
          `  - ${route.filePath}`
      );
    } else {
      pathMap.set(route.path, route);
    }
  }

  return errors;
}
