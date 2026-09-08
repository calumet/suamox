import { afterEach, describe, expect, it } from "vitest";

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
});
