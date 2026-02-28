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

  it('runs hooks and injects initial data', async () => {
    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: '<div>Before</div>',
      head: '<title>Dev</title>',
      initialData: { ok: true },
    });

    const routes: unknown[] = [];
    const ssrLoadModule = vi.fn(() => Promise.resolve({ routes }));
    const transformIndexHtml = vi.fn((_url: string, html: string) => Promise.resolve(html));
    const vite = {
      ssrLoadModule,
      transformIndexHtml,
      ssrFixStacktrace: vi.fn(),
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
