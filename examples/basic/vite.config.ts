import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { suamoxPages } from "@calumet/suamox-vite-plugin-pages";

export default defineConfig({
  plugins: [
    react(),
    suamoxPages({
      pagesDir: "src/pages",
      extensions: [".tsx", ".ts"],
    }),
  ],
  build: {
    outDir: "dist/client",
    manifest: true,
  },
  server: {
    // En middleware mode el ws de HMR usa 24678 fijo, y dos dev servers de Vite
    // no pueden convivir. Derivarlo del puerto deja correr la suite igual.
    hmr: { port: Number(process.env.PORT ?? 3000) + 20000 },
  },
});
