import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ViteDevServer } from 'vite';
import type { RenderOptions, RenderResult } from '@calumet/suamox';

const mocks = vi.hoisted(() => ({
  renderPage: vi.fn(),
  generateHTML: vi.fn(),
  serializeData: vi.fn((data: unknown) => JSON.stringify(data)),
  matchRoute: vi.fn(() => null),
}));

vi.mock('@calumet/suamox', () => ({
  renderPage: mocks.renderPage,
  generateHTML: mocks.generateHTML,
  serializeData: mocks.serializeData,
  matchRoute: mocks.matchRoute,
}));

import { createDevHandler, createHonoApp, createProdHandler } from '../src/index';

describe('createHonoApp', () => {
  it('exposes a health endpoint', async () => {
    const app = createHonoApp();

    const response = await app.request('http://localhost/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('createDevHandler', () => {
  beforeEach(() => {
    mocks.renderPage.mockReset();
    mocks.generateHTML.mockReset();
    mocks.serializeData.mockClear();
  });

  it('runs hooks and injects initial data with auto-collected CSS', async () => {
    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: '<div>Before</div>',
      head: '<title>Dev</title>',
      initialData: { ok: true },
    });

    const routes: unknown[] = [];

    const globalCssMod = {
      url: '/src/styles/global.css',
      type: 'css' as const,
      importedModules: new Set(),
    };
    const entryClientMod = {
      url: '/src/entry-client.tsx',
      type: 'js' as const,
      importedModules: new Set([globalCssMod]),
    };
    const virtualPagesMod = {
      url: 'virtual:pages',
      type: 'js' as const,
      importedModules: new Set(),
    };

    const ssrLoadModule = vi.fn((id: string) => {
      if (id === '/src/styles/global.css') return Promise.resolve({ default: 'body{color:red}' });
      if (id === '/src/entry-client.tsx') return Promise.resolve({});
      return Promise.resolve({ routes });
    });
    const getModuleByUrl = vi.fn((url: string) => {
      if (url === '/src/entry-client.tsx') return Promise.resolve(entryClientMod);
      if (url === 'virtual:pages') return Promise.resolve(virtualPagesMod);
      return Promise.resolve(undefined);
    });
    const transformIndexHtml = vi.fn((_url: string, html: string) => Promise.resolve(html));
    const vite = {
      ssrLoadModule,
      transformIndexHtml,
      ssrFixStacktrace: vi.fn(),
      moduleGraph: { getModuleByUrl },
    } as unknown as ViteDevServer;

    const onBeforeRender = vi.fn((ctx: RenderOptions) => ({ ...ctx, pathname: '/changed' }));
    const onAfterRender = vi.fn((result: RenderResult) => ({
      ...result,
      html: '<div>After</div>',
    }));

    const app = createDevHandler({ vite, onBeforeRender, onAfterRender });
    const response = await app.request('http://localhost/');
    const body = await response.text();

    expect(onBeforeRender).toHaveBeenCalledTimes(1);
    expect(mocks.renderPage).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/changed' })
    );
    expect(onAfterRender).toHaveBeenCalledTimes(1);
    expect(transformIndexHtml).toHaveBeenCalledTimes(1);
    expect(body).toContain('<div>After</div>');
    expect(body).toContain('window.__INITIAL_DATA__ = {"ok":true}');
    expect(body).toContain('<style data-dev-css>body{color:red}</style>');
  });

  it('collects CSS from multiple modules across the graph', async () => {
    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: '<div>Page</div>',
      head: '',
      initialData: null,
    });

    const pageCssMod = {
      url: '/src/pages/index.module.css',
      type: 'css' as const,
      importedModules: new Set(),
    };
    const globalCssMod = {
      url: '/src/styles/global.css',
      type: 'css' as const,
      importedModules: new Set(),
    };
    const pageComponentMod = {
      url: '/src/pages/index.tsx',
      type: 'js' as const,
      importedModules: new Set([pageCssMod]),
    };
    const entryClientMod = {
      url: '/src/entry-client.tsx',
      type: 'js' as const,
      importedModules: new Set([globalCssMod]),
    };
    const virtualPagesMod = {
      url: 'virtual:pages',
      type: 'js' as const,
      importedModules: new Set([pageComponentMod]),
    };

    const ssrLoadModule = vi.fn((id: string) => {
      if (id === '/src/styles/global.css') return Promise.resolve({ default: 'body{margin:0}' });
      if (id === '/src/pages/index.module.css') return Promise.resolve({ default: '.root{color:blue}' });
      if (id === '/src/entry-client.tsx') return Promise.resolve({});
      return Promise.resolve({ routes: [] });
    });
    const getModuleByUrl = vi.fn((url: string) => {
      if (url === '/src/entry-client.tsx') return Promise.resolve(entryClientMod);
      if (url === 'virtual:pages') return Promise.resolve(virtualPagesMod);
      return Promise.resolve(undefined);
    });

    const vite = {
      ssrLoadModule,
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      moduleGraph: { getModuleByUrl },
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    const response = await app.request('http://localhost/');
    const body = await response.text();

    expect(body).toContain('body{margin:0}');
    expect(body).toContain('.root{color:blue}');
    expect(body).toContain('data-dev-css');
  });

  it('handles empty module graph gracefully', async () => {
    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: '<div>Page</div>',
      head: '',
      initialData: null,
    });

    const vite = {
      ssrLoadModule: vi.fn(() => Promise.resolve({ routes: [] })),
      transformIndexHtml: vi.fn((_url: string, html: string) => Promise.resolve(html)),
      ssrFixStacktrace: vi.fn(),
      moduleGraph: { getModuleByUrl: vi.fn(() => Promise.resolve(undefined)) },
    } as unknown as ViteDevServer;

    const app = createDevHandler({ vite });
    const response = await app.request('http://localhost/');
    const body = await response.text();

    expect(body).not.toContain('data-dev-css');
    expect(response.status).toBe(200);
  });
});

describe('createProdHandler', () => {
  beforeEach(() => {
    mocks.renderPage.mockReset();
    mocks.generateHTML.mockReset();
    mocks.matchRoute.mockReset();
    mocks.matchRoute.mockReturnValue(null);
  });

  it('uses the manifest client entry for scripts and styles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suamox-hono-'));
    const serverDir = join(root, 'dist', 'server');
    const clientDir = join(root, 'dist', 'client', '.vite');
    const staticDir = join(root, 'dist', 'static');
    const routeFilePath = join(root, 'src', 'pages', 'index.tsx');

    await mkdir(serverDir, { recursive: true });
    await mkdir(clientDir, { recursive: true });
    await mkdir(staticDir, { recursive: true });
    await writeFile(
      join(serverDir, 'entry-server.mjs'),
      `export const routes = [{ path: '/', filePath: ${JSON.stringify(routeFilePath)} }];`
    );
    await writeFile(
      join(clientDir, 'manifest.json'),
      JSON.stringify({
        'index.html': {
          file: 'assets/client.js',
          imports: ['assets/chunk.js'],
          css: ['assets/client.css'],
        },
        'src/pages/index.tsx': {
          file: 'assets/index.js',
          imports: ['assets/chunk.js'],
          css: ['assets/index.css'],
        },
        'assets/chunk.js': {
          file: 'assets/chunk.js',
          css: ['assets/chunk.css'],
        },
      })
    );
    mocks.matchRoute.mockReturnValue({
      route: { filePath: routeFilePath },
      params: {},
    });

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: '<div>Prod</div>',
      head: '',
      initialData: null,
    });
    mocks.generateHTML.mockImplementation(
      ({ html, scripts, styles }: { html: string; scripts?: string[]; styles?: string[] }) => {
        return `<html>${html}<script src="${scripts?.[0] ?? ''}"></script><link rel="stylesheet" href="${styles?.[0] ?? ''}"></html>`;
      }
    );

    const app = createProdHandler({
      root,
      clientDir: join(root, 'dist', 'client'),
      serverEntry: join(root, 'dist', 'server', 'entry-server.mjs'),
      staticDir: join(root, 'dist', 'static'),
    });
    const response = await app.request('http://localhost/');
    const body = await response.text();

    expect(mocks.generateHTML).toHaveBeenCalledWith(
      expect.objectContaining({
        scripts: ['/assets/client.js'],
        preloadScripts: ['/assets/client.js', '/assets/chunk.js', '/assets/index.js'],
        styles: ['/assets/client.css', '/assets/chunk.css', '/assets/index.css'],
        scriptPlacement: 'head',
      })
    );
    expect(body).toContain('/assets/client.js');
    expect(body).toContain('/assets/client.css');
  });
});
