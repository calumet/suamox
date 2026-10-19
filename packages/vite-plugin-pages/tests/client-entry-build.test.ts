import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

import { suamoxPages } from "../src/index";

describe("entrada del cliente", () => {
  it("arranca el router con el base de la config", async () => {
    const root = await mkdtemp(join(tmpdir(), "suamox-client-entry-"));
    await mkdir(join(root, "src", "pages"), { recursive: true });
    await writeFile(
      join(root, "src", "pages", "index.ts"),
      "export default function Page() { return null; }\n",
    );
    const external = [/^@calumet\//, /^react/];
    await build({
      root,
      base: "/docs/",
      logLevel: "silent",
      configFile: false,
      plugins: [suamoxPages()],
      build: { outDir: "dist/client", minify: false, rollupOptions: { external } },
    });

    const dir = join(root, "dist", "client", "assets");
    const entrada = (await readdir(dir)).find((nombre) => nombre.startsWith("entry-client"));
    const codigo = await readFile(join(dir, entrada as string), "utf-8");

    expect(codigo.slice(codigo.indexOf("startRouter({"))).toContain('base: "/docs"');
  }, 60_000);
});
