import { relative, sep } from "node:path";

import type { RouteRecord, RouteSegment, ParsedRoute } from "./types.js";

/**
 * Parsea la ruta de un archivo a un registro de ruta
 * @param filePath - Ruta absoluta del archivo de página
 * @param pagesDir - Ruta absoluta del directorio de páginas
 * @returns Ruta parseada con posibles errores
 */
export function parseRoute(filePath: string, pagesDir: string): ParsedRoute {
  const errors: string[] = [];
  const relativePath = relative(pagesDir, filePath);

  // Quitar extensión
  const withoutExt = relativePath.replace(/\.(tsx?|jsx?)$/, "");

  // Separar en segmentos
  const parts = withoutExt.split(sep).filter(Boolean);

  // Procesar segmentos
  const segments: RouteSegment[] = [];
  const params: string[] = [];
  const pathParts: string[] = [];
  let isCatchAll = false;
  let isIndex = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;

    // Quitar grupos de rutas (admin) -> no se agregan al path
    if (part.startsWith("(") && part.endsWith(")")) {
      continue;
    }

    // Manejar archivos index
    if (part === "index") {
      isIndex = true;
      continue;
    }

    // Manejar catch-all [...param]
    if (part.startsWith("[...") && part.endsWith("]")) {
      const paramName = part.slice(4, -1);
      if (!paramName) {
        errors.push(`Invalid catch-all segment: ${part}`);
        continue;
      }

      segments.push({
        type: "catchAll",
        value: "*",
        paramName,
      });
      params.push(paramName);
      pathParts.push("*");
      isCatchAll = true;

      // Catch-all debe ser el ultimo segmento
      if (i !== parts.length - 1) {
        errors.push("Catch-all parameter must be the last segment");
      }
      continue;
    }

    // Manejar parámetros dinámicos [param]
    if (part.startsWith("[") && part.endsWith("]")) {
      const paramName = part.slice(1, -1);
      if (!paramName) {
        errors.push(`Invalid parameter segment: ${part}`);
        continue;
      }

      segments.push({
        type: "param",
        value: `:${paramName}`,
        paramName,
      });
      params.push(paramName);
      pathParts.push(`:${paramName}`);
      continue;
    }

    // Segmento estático
    segments.push({
      type: "static",
      value: part,
    });
    pathParts.push(part);
  }

  // Construir path final
  const path = "/" + pathParts.join("/");

  // Calcular prioridad (más alta = se evalúa primero)
  // Segmentos estáticos tienen más prioridad, luego params, luego catch-all
  // Rutas más profundas tienen mayor prioridad
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
 * Calcula la prioridad de la ruta para ordenamiento
 * Las rutas con mayor prioridad se evalúan primero
 */
function calculatePriority(segments: RouteSegment[]): number {
  let priority = 0;

  // La profundidad suma prioridad (rutas más específicas primero)
  priority += segments.length * 100;

  // Restar fuerte para catch-all y asegurar que queden al final
  let hasCatchAll = false;

  // Segmentos estáticos agregan más prioridad
  for (const segment of segments) {
    if (segment.type === "static") {
      priority += 10;
    } else if (segment.type === "param") {
      priority += 5;
    } else if (segment.type === "catchAll") {
      hasCatchAll = true;
      // Catch-all reduce la prioridad de forma importante
      priority -= 1000;
    }
  }

  // Caso especial: sin segmentos (index raiz), darle prioridad alta
  if (segments.length === 0) {
    priority = 10000;
  }

  // Rutas catch-all siempre al final, aunque sean profundas
  if (hasCatchAll) {
    priority -= 10000;
  }

  return priority;
}

/**
 * Ordena rutas por prioridad (más alta primero)
 */
export function sortRoutes(routes: RouteRecord[]): RouteRecord[] {
  return [...routes].sort((a, b) => {
    // Mayor prioridad primero
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    // Si la prioridad es igual, ordenar alfabéticamente para consistencia
    return a.path.localeCompare(b.path);
  });
}

/**
 * Valida rutas y devuelve errores únicos
 */
export function validateRoutes(routes: RouteRecord[]): string[] {
  const errors: string[] = [];
  const pathMap = new Map<string, RouteRecord>();

  for (const route of routes) {
    // Verificar paths duplicados
    const existing = pathMap.get(route.path);
    if (existing) {
      errors.push(
        `Duplicate route path: ${route.path}\n` +
          `  - ${existing.filePath}\n` +
          `  - ${route.filePath}`,
      );
    } else {
      pathMap.set(route.path, route);
    }
  }

  return errors;
}
