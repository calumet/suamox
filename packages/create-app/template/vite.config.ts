import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import suamoxPages from "@calumet/suamox-vite-plugin-pages";

export default defineConfig({
  plugins: [react(), suamoxPages()],
  build: {
    outDir: "dist/client",
    manifest: true,
  },
});
