import { suamoxPages } from "@calumet/suamox-vite-plugin-pages";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
});
