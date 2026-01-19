import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@suamox/ssr-runtime'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
