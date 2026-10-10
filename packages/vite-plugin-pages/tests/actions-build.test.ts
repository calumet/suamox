import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

import { suamoxPages } from "../src/index";

const SECRETO = "MARKER_ACTION_SOURCE_13579";

async function readOutput(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && /\.(js|map)$/.test(entry.name)) {
      files.set(entry.name, await readFile(join(entry.parentPath, entry.name), "utf-8"));
    }
  }
  return files;
}

/** Proyecto mínimo: una página que importa una acción y arranca un worker */
async function createProject(worker: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "suamox-actions-build-"));
  await mkdir(join(root, "src", "pages"), { recursive: true });
  await writeFile(
    join(root, "src", "notas.actions.ts"),
    `const secreto: string = "${SECRETO}";\n` +
      `export type Nota = { texto: string };\n` +
      `export async function guardar(nota: Nota) { return secreto + nota.texto; }\n` +
      `export async function interno() { return secreto; }\n`,
  );
  await writeFile(join(root, "src", "worker.ts"), worker);
  await writeFile(
    join(root, "src", "pages", "index.ts"),
    `import { guardar } from "../notas.actions";\n` +
      `new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });\n` +
      `export default function Page() { void guardar({ texto: "" }); return null; }\n`,
  );
  return root;
}

// Sin el router instalado en la carpeta temporal: lo que importa es el código emitido
const external = [/^@calumet\//, /^react/];

const buildProject = (root: string) =>
  build({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [suamoxPages()],
    build: { outDir: "dist/client", sourcemap: true, rollupOptions: { external } },
    worker: { format: "es", rollupOptions: { external } },
  });

describe("build del cliente con acciones", () => {
  let files = new Map<string, string>();
  let manifest: Record<string, { file: string; name: string }> = {};

  beforeAll(async () => {
    const root = await createProject(
      `import { guardar } from "./notas.actions";\nvoid guardar({ texto: "" });\n`,
    );
    await buildProject(root);
    files = await readOutput(join(root, "dist", "client"));
    manifest = JSON.parse(await readFile(join(root, "dist", ".vite", "actions.json"), "utf-8"));
  }, 60_000);

  it("el worker lleva el stub y no el módulo", () => {
    const worker = [...files].find(([name]) => name.startsWith("worker") && name.endsWith(".js"));
    expect(worker?.[1]).toMatch(/[0-9a-f]{16}/);
  });

  it("ni el JS ni los mapas de fuente traen el código de la acción", () => {
    for (const [name, content] of files) {
      expect(content, name).not.toContain(SECRETO);
    }
    expect([...files.keys()].some((name) => name.endsWith(".map"))).toBe(true);
  });

  it("un export que el cliente no importa no queda como endpoint", () => {
    expect(Object.values(manifest).map((entry) => entry.name)).toEqual(["guardar"]);
  });
});

describe("build del cliente con un worker que importa el fuente", () => {
  it("falla en vez de emitir el archivo tal cual", async () => {
    const root = await createProject(
      `import fuente from "./notas.actions.ts?raw";\nconsole.log(fuente);\n`,
    );
    await expect(buildProject(root)).rejects.toThrow(/with a query from client code/);
  }, 60_000);
});
