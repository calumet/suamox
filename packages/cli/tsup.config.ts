import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@calumet/suamox'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
