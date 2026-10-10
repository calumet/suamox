import { parseSync } from "vite";
import { describe, it, expect } from "vitest";

import { stripServerExports } from "../src/strip-server-exports";

function strip(source: string): string | null {
  const parsed = parseSync("/pages/page.tsx", source);
  expect(parsed.errors).toEqual([]);
  const result = stripServerExports(source, parsed.program, "/pages/page.tsx");
  if (!result) return null;
  expect(parseSync("/pages/page.js", result.code).errors).toEqual([]);
  return result.code;
}

/** Como lo recibe el plugin en `load`: el fuente TS, que conserva sus tipos tras el stripping */
function stripTs(source: string): string | null {
  const parsed = parseSync("/pages/page.tsx", source);
  expect(parsed.errors).toEqual([]);
  const result = stripServerExports(source, parsed.program, "/pages/page.tsx");
  if (!result) return null;
  expect(parseSync("/pages/page.tsx", result.code).errors).toEqual([]);
  return result.code;
}

function exportNames(code: string): string[] {
  const names: string[] = [];
  for (const statement of parseSync("/out.js", code).module.staticExports) {
    for (const entry of statement.entries) {
      names.push(entry.exportName.name ?? "default");
    }
  }
  return names;
}

describe("stripServerExports", () => {
  it("returns null when there are no server-only exports", () => {
    expect(strip(`export const prerender = true;\nexport default function Page() {}`)).toBeNull();
  });

  it("returns null for a module with no exports at all", () => {
    expect(strip(`const x = 1;\nconsole.log(x);`)).toBeNull();
  });

  it("removes the loader and the imports it was the only user of", () => {
    const code = strip(`
import { db } from "./db";
import { Head } from "@calumet/suamox-head";
export function loader() { return db.all(); }
export default function Page() { return Head; }
`);

    expect(code).not.toContain("loader");
    expect(code).not.toContain("./db");
    expect(code).toContain("@calumet/suamox-head");
    expect(exportNames(code!)).toEqual(["default"]);
  });

  it("nombrar el loader en un tipo no lo conserva ni a sus imports", () => {
    for (const uso of [
      `export default function Page({ data }: PageProps<typeof loader>) { return data; }`,
      `export default function Page() { return useLoaderData<typeof loader>(); }`,
      `type Datos = Awaited<ReturnType<typeof loader>>;\nexport default function Page(p: { d: Datos }) { return p; }`,
      `interface Props { data: ReturnType<typeof loader> }\nexport default function Page(p: Props) { return p; }`,
      `export default function Page(): ReturnType<typeof loader> | null { return null; }`,
      `export default function Page() { return (null as unknown as ReturnType<typeof loader>); }`,
    ]) {
      const code = stripTs(`
import { sesionActual } from "@coma/auth/lecturas";
import { useLoaderData, type PageProps } from "@calumet/suamox";
export async function loader() { return sesionActual(); }
${uso}
`);

      expect(code, uso).not.toContain("@coma/auth/lecturas");
      expect(code, uso).not.toContain("export async function loader");
    }
  });

  it("lo que corre en runtime dentro de una expresión TS sigue contando", () => {
    const code = stripTs(`
import { db } from "./db";
import { formato } from "./formato";
export function loader() { return db.all(); }
export default function Page() { return (formato as (x: string) => string)("a"); }
`);

    expect(code).not.toContain("./db");
    expect(code).toContain("./formato");
  });

  it("removes imports of side-effectful modules, which tree shaking cannot", () => {
    const code = strip(`
import { registrar } from "./registro";
export async function loader() { return registrar(); }
export default function Page() { return null; }
`);

    expect(code).not.toContain("./registro");
  });

  it("removes top-level helpers only the loader used", () => {
    const code = strip(`
import { db } from "./db";
const TABLA = "usuarios";
function buscar(id) { return db.get(TABLA, id); }
export function loader({ params }) { return buscar(params.id); }
export default function Page() { return null; }
`);

    expect(code).not.toContain("./db");
    expect(code).not.toContain("buscar");
    expect(code).not.toContain("TABLA");
  });

  it("keeps helpers the component still uses", () => {
    const code = strip(`
import { formatear } from "./formato";
function titulo(t) { return formatear(t); }
export function loader() { return titulo("a"); }
export default function Page() { return titulo("b"); }
`);

    expect(code).toContain("./formato");
    expect(code).toContain("titulo");
    expect(code).not.toContain("loader");
  });

  it("keeps an import shared between the loader and the component", () => {
    const code = strip(`
import { db, formatear } from "./util";
export function loader() { return db.all(); }
export default function Page() { return formatear("x"); }
`);

    expect(code).toContain("./util");
  });

  it("keeps a bare side-effect import written by the user", () => {
    const code = strip(`
import "./estilos.css";
export function loader() { return 1; }
export default function Page() { return null; }
`);

    expect(code).toContain("./estilos.css");
  });

  it("does not remove a declaration whose initializer has side effects", () => {
    const code = strip(`
import { crear } from "./crear";
const cliente = crear();
export function loader() { return cliente.get(); }
export default function Page() { return null; }
`);

    expect(code).toContain("./crear");
    expect(code).toContain("cliente");
  });

  it("keeps prerender and csr next to a stripped loader", () => {
    const code = strip(`
export const prerender = true;
export const csr = false;
export function getStaticPaths() { return []; }
export default function Page() { return null; }
`);

    expect(exportNames(code!).sort()).toEqual(["csr", "default", "prerender"]);
    expect(code).not.toContain("getStaticPaths");
  });

  it("strips a server export declared with const", () => {
    const code = strip(`
import { db } from "./db";
export const loader = () => db.all();
export default function Page() { return null; }
`);

    expect(code).not.toContain("./db");
    expect(exportNames(code!)).toEqual(["default"]);
  });

  it("strips a server export whose initializer has side effects", () => {
    const code = strip(`
import { crearLoader } from "./crear";
export const loader = crearLoader({ tabla: "usuarios" });
export default function Page() { return null; }
`);

    expect(code).not.toContain("./crear");
    expect(code).not.toContain("crearLoader");
  });

  it("strips server names from an export specifier list", () => {
    const code = strip(`
import { db } from "./db";
const cargar = () => db.all();
const activo = true;
export { cargar as loader, activo as csr };
export default function Page() { return null; }
`);

    expect(exportNames(code!).sort()).toEqual(["csr", "default"]);
    expect(code).not.toContain("./db");
    expect(code).not.toContain("cargar");
  });

  it("strips server names from a re-export", () => {
    const code = strip(`
export { loader } from "./servidor";
export default function Page() { return null; }
`);

    expect(code).not.toContain("./servidor");
    expect(exportNames(code!)).toEqual(["default"]);
  });

  it("keeps the client-safe half of a mixed re-export", () => {
    const code = strip(`
export { loader, prerender } from "./config";
export default function Page() { return null; }
`);

    expect(exportNames(code!).sort()).toEqual(["default", "prerender"]);
    expect(code).toContain("./config");
  });

  it("keeps the client-safe half of a mixed declaration", () => {
    const code = strip(`
export const prerender = true, loader = () => 1;
export default function Page() { return null; }
`);

    expect(exportNames(code!).sort()).toEqual(["default", "prerender"]);
    expect(code).toContain("const prerender = true, loader");
  });

  it("keeps the module valid when every export is server-only", () => {
    const code = strip(`
import { db } from "./db";
export function loader() { return db.all(); }
`);

    expect(exportNames(code!)).toEqual([]);
    expect(code).not.toContain("./db");
  });

  it("keeps a server export that the component still references", () => {
    const code = strip(`
export function loader() { return { ok: true }; }
export default function Page() { return loader(); }
`);

    expect(code).toContain("function loader");
    expect(exportNames(code!)).toEqual(["default"]);
  });

  it("does not confuse a property name with an imported binding", () => {
    const code = strip(`
import { db } from "./db";
export function loader() { return db.all(); }
export default function Page({ data }) { return data.db; }
`);

    expect(code).not.toContain("./db");
  });

  it("keeps an import used only inside a destructuring default", () => {
    const code = strip(`
import { PORDEFECTO } from "./config";
export function loader() { return 1; }
export default function Page({ titulo = PORDEFECTO }) { return titulo; }
`);

    expect(code).toContain("./config");
  });

  it("does not keep a recursive helper alive through its own call", () => {
    const code = strip(`
import { db } from "./db";
function contar(n) { return n <= 0 ? db.n : contar(n - 1); }
export function loader() { return contar(3); }
export default function Page() { return null; }
`);

    expect(code).not.toContain("contar");
    expect(code).not.toContain("./db");
  });

  it("keeps the loader alive when a top-level statement assigns to it", () => {
    const code = strip(`
export function loader() { return 1; }
loader.hydrate = true;
export default function Page() { return null; }
`);

    expect(code).toContain("function loader");
    expect(code).toContain("loader.hydrate");
    expect(exportNames(code!)).toEqual(["default"]);
  });

  it("keeps a class whose static block runs on definition", () => {
    const code = strip(`
import { registrar } from "./registro";
class Registro { static { registrar(); } }
export function loader() { return Registro; }
export default function Page() { return null; }
`);

    expect(code).toContain("./registro");
  });

  it("emits a source map", () => {
    const source = `import { db } from "./db";\nexport function loader() { return db.all(); }\nexport default function Page() { return null; }\n`;
    const parsed = parseSync("/pages/page.tsx", source);
    const result = stripServerExports(source, parsed.program, "/pages/page.tsx");

    expect(result?.map.sources).toEqual(["/pages/page.tsx"]);
    expect(result?.map.mappings.length).toBeGreaterThan(0);
  });
});
