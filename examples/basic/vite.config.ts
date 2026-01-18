import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { suamoxPages } from '@suamox/vite-plugin-pages';

export default defineConfig({
  plugins: [
    react(),
    suamoxPages({
      pagesDir: 'src/pages',
      extensions: ['.tsx', '.ts'],
    }),
  ],
  build: {
    outDir: 'dist/client',
    manifest: true,
  },
});
