import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ViteDevServer } from 'vite';

const mocks = vi.hoisted(() => ({
  renderPage: vi.fn(),
  generateHTML: vi.fn(),
  serializeData: vi.fn((data: unknown) => JSON.stringify(data)),
}));

vi.mock('@suamox/ssr-runtime', () => ({
  renderPage: mocks.renderPage,
  generateHTML: mocks.generateHTML,
  serializeData: mocks.serializeData,
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
    const vite = {
      ssrLoadModule: vi.fn(async () => ({ routes })),
      transformIndexHtml: vi.fn(async (_url: string, html: string) => html),
      ssrFixStacktrace: vi.fn(),
    } as unknown as ViteDevServer;

    const onBeforeRender = vi.fn((ctx) => ({ ...ctx, pathname: '/changed' }));
    const onAfterRender = vi.fn((result) => ({ ...result, html: '<div>After</div>' }));

    const app = createDevHandler({ vite, onBeforeRender, onAfterRender });
    const response = await app.request('http://localhost/');
    const body = await response.text();

    expect(onBeforeRender).toHaveBeenCalledTimes(1);
    expect(mocks.renderPage).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/changed' }));
    expect(onAfterRender).toHaveBeenCalledTimes(1);
    expect(vite.transformIndexHtml).toHaveBeenCalledTimes(1);
    expect(body).toContain('<div>After</div>');
    expect(body).toContain('window.__INITIAL_DATA__ = {"ok":true}');
  });
});

describe('createProdHandler', () => {
  beforeEach(() => {
    mocks.renderPage.mockReset();
    mocks.generateHTML.mockReset();
  });

  it('uses the manifest client entry for scripts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suamox-hono-'));
    const serverDir = join(root, 'dist', 'server');
    const clientDir = join(root, 'dist', 'client', '.vite');
    const staticDir = join(root, 'dist', 'static');

    await mkdir(serverDir, { recursive: true });
    await mkdir(clientDir, { recursive: true });
    await mkdir(staticDir, { recursive: true });
    await writeFile(join(serverDir, 'entry-server.mjs'), 'export const routes = [];');
    await writeFile(
      join(clientDir, 'manifest.json'),
      JSON.stringify({ 'index.html': { file: 'assets/client.js' } })
    );

    mocks.renderPage.mockResolvedValue({
      status: 200,
      html: '<div>Prod</div>',
      head: '',
      initialData: null,
    });
    mocks.generateHTML.mockImplementation(({ html, scripts }) => {
      return `<html>${html}<script src="${scripts?.[0] ?? ''}"></script></html>`;
    });

    const app = createProdHandler({
      root,
      clientDir: join(root, 'dist', 'client'),
      serverEntry: join(root, 'dist', 'server', 'entry-server.mjs'),
    });
    const response = await app.request('http://localhost/');
    const body = await response.text();

    expect(mocks.generateHTML).toHaveBeenCalledWith(
      expect.objectContaining({
        scripts: ['/assets/client.js'],
        preloadScripts: ['/assets/client.js'],
        scriptPlacement: 'head',
      })
    );
    expect(body).toContain('/assets/client.js');
  });
});
