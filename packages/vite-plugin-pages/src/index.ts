import type { Plugin } from 'vite';

export interface SuamoxPagesOptions {
  pagesDir?: string;
  extensions?: string[];
}

export function suamoxPages(_options: SuamoxPagesOptions = {}): Plugin {
  return {
    name: 'suamox:pages',
    // Implementation will be added in Phase 1
  };
}

export default suamoxPages;
