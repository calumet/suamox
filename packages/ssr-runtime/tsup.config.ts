import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/ssg.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
});
