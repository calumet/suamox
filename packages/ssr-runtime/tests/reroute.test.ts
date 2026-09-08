import { afterEach, describe, expect, it, vi } from "vitest";

import { matchRoute, registerReroute } from "../src/index";
import type { RouteRecord } from "../src/index";

function createMockRoute(overrides: Partial<RouteRecord>): RouteRecord {
  return {
    path: "/",
    filePath: "/pages/index.tsx",
    component: (() => null) as RouteRecord["component"],
    layouts: [],
    params: [],
    isCatchAll: false,
    isIndex: true,
    priority: 0,
    ...overrides,
  };
}

const routes: RouteRecord[] = [
  createMockRoute({ path: "/", priority: 10000 }),
  createMockRoute({ path: "/ingresar", priority: 110 }),
  createMockRoute({ path: "/:slug", params: ["slug"], isIndex: false, priority: 105 }),
];

describe("reroute", () => {
  afterEach(() => {
    registerReroute(null);
  });

  it("casa la ruta que devuelve el hook, no la URL pedida", () => {
    registerReroute((pathname) => (pathname === "/en/ingresar" ? "/ingresar" : undefined));

    expect(matchRoute(routes, "/en/ingresar")?.route.path).toBe("/ingresar");
  });

  it("deja pasar la URL cuando el hook no devuelve nada", () => {
    registerReroute(() => undefined);

    expect(matchRoute(routes, "/mision-y-vision")?.route.path).toBe("/:slug");
  });

  it("normaliza la salida del hook", () => {
    registerReroute(() => "ingresar/");

    expect(matchRoute(routes, "/lo-que-sea")?.route.path).toBe("/ingresar");
  });

  it("recibe el pathname ya decodificado", () => {
    const vistos: string[] = [];
    registerReroute((pathname) => {
      vistos.push(pathname);
    });

    matchRoute(routes, "/mision%20y%20vision");

    expect(vistos).toEqual(["/mision y vision"]);
  });

  it("no decodifica dos veces la salida del hook", () => {
    registerReroute(() => "/mision%20y%20vision");

    expect(matchRoute(routes, "/x")?.params).toEqual({ slug: "mision%20y%20vision" });
  });

  it("desregistrar el hook restaura el match directo", () => {
    registerReroute(() => "/ingresar");
    registerReroute(null);

    expect(matchRoute(routes, "/mision-y-vision")?.route.path).toBe("/:slug");
  });

  it("devuelve el pathname contra el que caso, para que el middleware lo use", () => {
    registerReroute((pathname) => (pathname === "/en/ingresar" ? "/ingresar" : undefined));

    expect(matchRoute(routes, "/en/ingresar")?.pathname).toBe("/ingresar");
    expect(matchRoute(routes, "/ingresar/")?.pathname).toBe("/ingresar");
  });

  it("un hook que lanza no tumba el match", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    registerReroute(() => {
      throw new Error("boom");
    });

    expect(matchRoute(routes, "/mision-y-vision")?.route.path).toBe("/:slug");
    expect(errores).toHaveBeenCalled();
    errores.mockRestore();
  });

  it("colapsa las barras iniciales de la salida", () => {
    registerReroute(() => "//ingresar");

    expect(matchRoute(routes, "/x")?.pathname).toBe("/ingresar");
  });

  // `/\evil.com` y `//evil.com` resuelven al origen evil.com, no a una ruta
  it.each(["//evil.com", "/\\evil.com", "\\\\evil.com", "/\\/evil.com"])(
    "no deja que %s salga del origen",
    (salida) => {
      registerReroute(() => salida);

      const pathname = matchRoute(routes, "/x")?.pathname ?? "/";
      expect(new URL(pathname, "http://app.example").origin).toBe("http://app.example");
    },
  );

  it("tampoco lo deja pasar sin reroute, al decodificar la URL", () => {
    const pathname = matchRoute(routes, "/%5Cevil.com")?.pathname ?? "/";

    expect(new URL(pathname, "http://app.example").origin).toBe("http://app.example");
  });

  it("un hook que lanza avisa una vez, no en cada peticion", () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    registerReroute(() => {
      throw new Error("boom");
    });

    for (let i = 0; i < 20; i++) {
      matchRoute(routes, "/mision-y-vision");
    }

    expect(errores).toHaveBeenCalledTimes(1);
    errores.mockRestore();
  });
});
