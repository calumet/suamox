import { describe, it, expect } from "vitest";

import { findServerLeaks, formatLeakError, type ChunkModules } from "../src/validator";

const API_DIR = "/proyecto/src/api";

const chunk = (ids: string[], fileName = "assets/index-abc.js"): ChunkModules[] => [
  { fileName, ids },
];

describe("findServerLeaks", () => {
  it("no reporta nada en un bundle limpio", () => {
    const leaks = findServerLeaks(
      chunk([
        "/proyecto/src/pages/index.tsx",
        "/proyecto/src/lib/format.ts",
        "/proyecto/node_modules/react/index.js",
      ]),
      API_DIR,
    );

    expect(leaks).toEqual([]);
  });

  it("detecta un archivo .server en cualquiera de sus extensiones", () => {
    for (const ext of ["ts", "tsx", "js", "jsx"]) {
      const leaks = findServerLeaks(chunk([`/proyecto/src/lib/db.server.${ext}`]), API_DIR);
      expect(leaks).toHaveLength(1);
      expect(leaks[0]?.reason).toBe("server-file");
    }
  });

  it("detecta una ruta de API", () => {
    const leaks = findServerLeaks(chunk(["/proyecto/src/api/users/[id].ts"]), API_DIR);

    expect(leaks).toEqual([
      {
        fileName: "assets/index-abc.js",
        moduleId: "/proyecto/src/api/users/[id].ts",
        reason: "api-route",
      },
    ]);
  });

  it("detecta builtins de node que quedan como import externo", () => {
    const leaks = findServerLeaks(chunk(["/proyecto/src/pages/index.tsx", "node:fs"]), API_DIR);

    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.moduleId).toBe("node:fs");
    expect(leaks[0]?.reason).toBe("node-builtin");
  });

  it("detecta el stub con el que Vite reemplaza un builtin", () => {
    // Vite no deja "node:fs" en el bundle: mete __vite-browser-external en su lugar,
    // asi que ese stub es la unica huella que queda del builtin filtrado
    for (const id of ["__vite-browser-external", "\0__vite-browser-external:fs"]) {
      const leaks = findServerLeaks(chunk([id]), API_DIR);
      expect(leaks).toHaveLength(1);
      expect(leaks[0]?.reason).toBe("node-builtin");
    }
  });

  it("no confunde un paquete con el nombre de un builtin", () => {
    // `events` o `path` en node_modules son polyfills legitimos del browser
    const leaks = findServerLeaks(
      chunk([
        "/proyecto/node_modules/events/events.js",
        "/proyecto/node_modules/path-browserify/index.js",
      ]),
      API_DIR,
    );

    expect(leaks).toEqual([]);
  });

  it("ignora los modulos virtuales del framework", () => {
    const leaks = findServerLeaks(chunk(["\0virtual:pages", "\0vite/preload-helper"]), API_DIR);

    expect(leaks).toEqual([]);
  });

  it("ignora el query string del id", () => {
    const leaks = findServerLeaks(
      chunk(["/proyecto/src/lib/db.server.ts?__suamox-client-route"]),
      API_DIR,
    );

    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.moduleId).toBe("/proyecto/src/lib/db.server.ts");
  });

  it("no marca una carpeta que solo empieza igual que src/api", () => {
    const leaks = findServerLeaks(chunk(["/proyecto/src/apiClient/fetch.ts"]), API_DIR);

    expect(leaks).toEqual([]);
  });

  it("recorre todos los chunks", () => {
    const leaks = findServerLeaks(
      [
        { fileName: "a.js", ids: ["/proyecto/src/lib/db.server.ts"] },
        { fileName: "b.js", ids: ["/proyecto/src/pages/index.tsx"] },
        { fileName: "c.js", ids: ["node:crypto"] },
      ],
      API_DIR,
    );

    expect(leaks.map((l) => l.fileName)).toEqual(["a.js", "c.js"]);
  });
});

describe("formatLeakError", () => {
  it("agrupa por chunk y muestra rutas relativas al root", () => {
    const mensaje = formatLeakError(
      [
        { fileName: "a.js", moduleId: "/proyecto/src/lib/db.server.ts", reason: "server-file" },
        { fileName: "a.js", moduleId: "node:fs", reason: "node-builtin" },
        { fileName: "b.js", moduleId: "/proyecto/src/api/health.ts", reason: "api-route" },
      ],
      "/proyecto",
    );

    expect(mensaje).toContain("  a.js\n");
    expect(mensaje).toContain("src/lib/db.server.ts (server-only file (*.server.*))");
    expect(mensaje).toContain("node:fs (Node builtin");
    expect(mensaje).toContain("  b.js\n");
    expect(mensaje).toContain("src/api/health.ts (API route (src/api/))");
    // el builtin no se toca al relativizar
    expect(mensaje).not.toContain("../node:fs");
  });
});
