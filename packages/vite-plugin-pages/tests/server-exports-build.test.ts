import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

import { suamoxPages } from "../src/index";

const SECRETO_LOADER = "MARKER_LOADER_SOURCE_97531";
const SECRETO_MODULO = "MARKER_SERVER_MODULE_86420";

describe("build del cliente con mapas de fuente", () => {
  const files = new Map<string, string>();

  beforeAll(async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-strip-build-"));
    await mkdir(join(root, "src", "pages"), { recursive: true });
    await writeFile(
      join(root, "src", "datos.server.ts"),
      `export const leer = (): string => "${SECRETO_MODULO}";\n`,
    );
    await writeFile(
      join(root, "src", "pages", "index.tsx"),
      [
        `import { leer } from "../datos.server";`,
        `interface Datos { texto: string }`,
        `export function loader(): Datos {`,
        `  return { texto: leer() + "${SECRETO_LOADER}" };`,
        `}`,
        `export default function Page({ data }: { data: Datos }) {`,
        `  return <p>{data.texto}</p>;`,
        `}`,
      ].join("\n"),
    );

    const external = [/^@calumet\//, /^react/];
    await build({
      root,
      logLevel: "silent",
      configFile: false,
      plugins: [suamoxPages()],
      build: { outDir: "dist/client", sourcemap: true, rollupOptions: { external } },
    });

    const outDir = join(root, "dist", "client");
    for (const entry of await readdir(outDir, { withFileTypes: true, recursive: true })) {
      if (entry.isFile() && /\.(js|map)$/.test(entry.name)) {
        files.set(entry.name, await readFile(join(entry.parentPath, entry.name), "utf-8"));
      }
    }
  }, 60_000);

  it("emite el mapa de la página con su componente", () => {
    const maps = [...files].filter(([name]) => name.endsWith(".map")).map(([, map]) => map);
    expect(maps.some((map) => map.includes("export default function Page"))).toBe(true);
  });

  it("ni el JS ni los mapas traen el loader ni lo que importa", () => {
    for (const [name, content] of files) {
      expect(content, name).not.toContain(SECRETO_LOADER);
      expect(content, name).not.toContain(SECRETO_MODULO);
      expect(content, name).not.toContain("datos.server");
    }
  });
});
