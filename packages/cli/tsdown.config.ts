import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  sourcemap: true,
  // Con platform node tsdown emite .mjs, y los exports del paquete apuntan a
  // .js. El paquete ya es `type: module`, asi que .js de por si es ESM
  fixedExtension: false,
});
