import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  sourcemap: true,
  fixedExtension: false,
  // Los tipos publicos usan `ESTree` de vite: sin resolver, el .d.ts sale con
  // un import a un tipo que el consumidor no tiene por que tener instalado
  dts: { resolve: true },
});
