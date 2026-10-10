import { parseSync } from "vite";
import { describe, expect, it } from "vitest";

import {
  ACTIONS_CLIENT_MODULE_ID,
  actionId,
  collectActionExports,
  generateActionStubs,
  generateActionsCode,
  isActionsFile,
  referencedActionIds,
} from "../src/actions";

describe("isActionsFile", () => {
  it("reconoce *.actions.* y nada más", () => {
    expect(isActionsFile("/app/src/features/portal/ajustes.actions.ts")).toBe(true);
    expect(isActionsFile("/app/packages/portal/src/ajustes.actions.tsx")).toBe(true);
    expect(isActionsFile("/app/src/actions.ts")).toBe(false);
    expect(isActionsFile("/app/src/ajustes.actions.test.ts")).toBe(false);
  });

  it("no distingue mayúsculas y cubre todas las extensiones de módulo", () => {
    // En macOS `../X.Actions` resuelve al mismo archivo que `x.actions.ts`
    expect(isActionsFile("/app/src/X.Actions.ts")).toBe(true);
    for (const ext of ["mts", "cts", "mjs", "cjs", "js", "jsx"]) {
      expect(isActionsFile(`/app/src/a.actions.${ext}`), ext).toBe(true);
    }
  });
});

describe("actionId", () => {
  it("es estable con la misma clave y no deja ver la ruta", () => {
    const id = actionId("src/ajustes.actions.ts", "guardar", "clave");
    expect(id).toBe(actionId("src/ajustes.actions.ts", "guardar", "clave"));
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("sin la clave no se puede calcular", () => {
    expect(actionId("a.actions.ts", "x", "una")).not.toBe(actionId("a.actions.ts", "x", "otra"));
  });

  it("distingue archivo y export", () => {
    expect(actionId("a.actions.ts", "x", "k")).not.toBe(actionId("b.actions.ts", "x", "k"));
    expect(actionId("a.actions.ts", "x", "k")).not.toBe(actionId("a.actions.ts", "y", "k"));
  });
});

describe("referencedActionIds", () => {
  it("solo devuelve los ids que quedaron en el bundle", () => {
    const ids = ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"];
    expect([...referencedActionIds(`n("aaaaaaaaaaaaaaaa")`, ids)]).toEqual(["aaaaaaaaaaaaaaaa"]);
  });
});

describe("collectActionExports", () => {
  it("devuelve los exports con nombre y el default", () => {
    const code = [
      "export async function guardar() {}",
      "export const borrar = async () => {};",
      "const subir = async () => {};",
      "export { subir as subirImagen };",
      "export default async function () {}",
    ].join("\n");

    expect(collectActionExports(code, "/a.actions.js")).toEqual([
      "guardar",
      "borrar",
      "subirImagen",
      "default",
    ]);
  });

  it("lee el fuente en TS sin contar los exports de tipos", () => {
    const code = [
      "export type Nota = { texto: string };",
      "export interface Filtro { q: string }",
      "export async function guardar(nota: Nota): Promise<void> {}",
    ].join("\n");

    expect(collectActionExports(code, "/a.actions.ts")).toEqual(["guardar"]);
  });

  it("rechaza un export * porque no se puede enumerar", () => {
    expect(() => collectActionExports(`export * from "./otro";`, "/a.actions.js")).toThrow(
      /re-exports a whole module/,
    );
    expect(() => collectActionExports(`export * as todo from "./otro";`, "/a.actions.js")).toThrow(
      /re-exports a whole module/,
    );
  });

  it("rechaza un reexport de otro módulo, directo o por import", () => {
    expect(() =>
      collectActionExports(`export { borrar } from "./usuarios.server";`, "/a.actions.js"),
    ).toThrow(/re-exports from "\.\/usuarios\.server"/);
    expect(() =>
      collectActionExports(
        `import { borrar } from "./usuarios.server";\nexport { borrar };`,
        "/a.actions.js",
      ),
    ).toThrow(/exports "borrar", which is not a function/);
  });

  it("rechaza lo que no es una función", () => {
    for (const code of [
      `export const URL_BACKEND = "http://interno";`,
      `export const { a } = obj;`,
      `export class Cliente {}`,
      `export enum Estado { A }`,
      `const x = 1;\nexport default x;`,
    ]) {
      expect(() => collectActionExports(code, "/a.actions.ts"), code).toThrow(
        /must be a function declared in it/,
      );
    }
  });
});

describe("generateActionStubs", () => {
  it("solo importa el cliente de acciones y exporta los mismos nombres", () => {
    const code = generateActionStubs([
      { id: "aaaaaaaaaaaaaaaa", name: "guardar" },
      { id: "bbbbbbbbbbbbbbbb", name: "default" },
    ]);
    const parsed = parseSync("/stub.js", code);

    expect(parsed.errors).toEqual([]);
    expect(parsed.module.staticImports.map((i) => i.moduleRequest.value)).toEqual([
      ACTIONS_CLIENT_MODULE_ID,
    ]);
    const names = parsed.module.staticExports.flatMap((s) =>
      s.entries.map((e) => (e.exportName.kind === "Default" ? "default" : e.exportName.name)),
    );
    expect(names).toEqual(["guardar", "default"]);
    expect(code).toContain(`/* @__PURE__ */ createAction("aaaaaaaaaaaaaaaa")`);
  });

  it("un nombre que no es identificador va entre comillas y no se interpola", () => {
    const code = generateActionStubs([{ id: "aaaaaaaaaaaaaaaa", name: 'x-y"; alert(1); "' }]);
    const parsed = parseSync("/stub.js", code);

    expect(parsed.errors).toEqual([]);
    expect(parsed.module.staticExports[0]?.entries[0]?.exportName.name).toBe('x-y"; alert(1); "');
  });
});

describe("generateActionsCode", () => {
  it("carga cada acción por su ruta absoluta y su export", () => {
    const code = generateActionsCode(
      { aaaaaaaaaaaaaaaa: { file: "../paquete/src/ajustes.actions.ts", name: "guardar" } },
      "/repo/apps/web",
    );

    expect(parseSync("/entry.js", code).errors).toEqual([]);
    expect(code).toContain(`import("/repo/apps/paquete/src/ajustes.actions.ts")`);
    expect(code).toContain(`m["guardar"]`);
    expect(code).toContain(`file: "../paquete/src/ajustes.actions.ts", name: "guardar"`);
  });
});
