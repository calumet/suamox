import { isAbsolute, relative } from "node:path";

/** Motivo por el que un modulo no deberia estar en el bundle del cliente */
export type LeakReason = "server-file" | "api-route" | "node-builtin";

export interface ServerLeak {
  fileName: string;
  moduleId: string;
  reason: LeakReason;
}

/** Un chunk del bundle con los ids que quedaron dentro (modulos e imports externos) */
export interface ChunkModules {
  fileName: string;
  ids: readonly string[];
}

const SERVER_FILE_RE = /\.server\.(ts|tsx|js|jsx)$/;

/** Stub con el que Vite reemplaza un builtin de Node al bundlear para el browser */
const BROWSER_EXTERNAL = "__vite-browser-external";

const normalize = (id: string): string => (id.split("?")[0] ?? id).replace(/\\/g, "/");

function classify(id: string, apiDir: string): LeakReason | null {
  // Vite no deja `node:fs` en el bundle: lo sustituye por su stub vacio, asi que
  // el marcador de un builtin filtrado es el stub, no el nombre del modulo
  if (id.includes(BROWSER_EXTERNAL) || id.startsWith("node:")) return "node-builtin";
  if (SERVER_FILE_RE.test(id)) return "server-file";
  if (id.startsWith(apiDir)) return "api-route";
  return null;
}

/**
 * Busca modulos server-only que hayan llegado al bundle del cliente.
 *
 * Es la red de seguridad del stripping: `resolveId` y el proxy actuan antes, y esto
 * comprueba el resultado real por si algo los evade (un alias, otro plugin que
 * resuelve primero, un import dinamico). Mira los ids que Rollup incluyo, no el
 * texto del bundle, asi que no depende de que un nombre sobreviva al minificador.
 */
export function findServerLeaks(chunks: readonly ChunkModules[], apiDir: string): ServerLeak[] {
  const normalizedApiDir = normalize(apiDir).replace(/\/+$/, "") + "/";
  const leaks: ServerLeak[] = [];

  for (const chunk of chunks) {
    for (const id of chunk.ids) {
      const clean = normalize(id);
      const reason = classify(clean, normalizedApiDir);
      if (reason) {
        leaks.push({ fileName: chunk.fileName, moduleId: clean, reason });
      }
    }
  }

  return leaks;
}

const REASON_LABEL: Record<LeakReason, string> = {
  "server-file": "server-only file (*.server.*)",
  "api-route": "API route (src/api/)",
  "node-builtin": "Node builtin, unavailable in the browser",
};

const display = (moduleId: string, root: string): string =>
  isAbsolute(moduleId) ? relative(root, moduleId).replace(/\\/g, "/") : moduleId;

/** Mensaje de build con los modulos filtrados, agrupados por chunk */
export function formatLeakError(leaks: readonly ServerLeak[], root: string): string {
  const byChunk = new Map<string, ServerLeak[]>();
  for (const leak of leaks) {
    const current = byChunk.get(leak.fileName);
    if (current) current.push(leak);
    else byChunk.set(leak.fileName, [leak]);
  }

  const detail = Array.from(byChunk, ([fileName, items]) => {
    const lines = items.map(
      (leak) => `    - ${display(leak.moduleId, root)} (${REASON_LABEL[leak.reason]})`,
    );
    return `  ${fileName}\n${lines.join("\n")}`;
  }).join("\n");

  return (
    `[suamox:pages] Server-only code reached the client bundle:\n\n${detail}\n\n` +
    `The chunk name points to the page that pulled it in. To fix this, you can:\n` +
    `  1. Use the import inside loader()/getStaticPaths(), never in the component\n` +
    `  2. Move it to a *.server.ts file, which is excluded from the client bundle\n` +
    `  3. Check for an alias or plugin resolving the import before suamox:pages sees it`
  );
}
