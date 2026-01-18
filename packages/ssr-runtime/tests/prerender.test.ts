import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prerender } from '../src/ssg';
import type { RouteRecord } from '../src/index';

function createMockRoute(overrides: Partial<RouteRecord>): RouteRecord {
  return {
    path: '/',
    filePath: '/pages/index.tsx',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    component: (() => createElement('div', null, 'Home')) as any,
    layouts: [],
    params: [],
    isCatchAll: false,
    isIndex: true,
    priority: 0,
    ...overrides,
  };
}

describe('prerender', () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'suamox-prerender-'));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it('writes static and dynamic routes', async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/',
        prerender: true,
        component: (() => createElement('div', null, 'Home')) as RouteRecord['component'],
      }),
      createMockRoute({
        path: '/blog/:slug',
        params: ['slug'],
        isIndex: false,
        prerender: true,
        getStaticPaths: async () => [{ params: { slug: 'hello-world' } }],
        loader: async ({ params }) => ({ slug: params.slug }),
        component: (({ data }: { data: { slug: string } }) =>
          createElement('div', null, `Post ${data.slug}`)) as RouteRecord['component'],
      }),
    ];

    await prerender({
      routes,
      outDir,
      baseUrl: 'http://localhost',
    });

    const indexHtml = await readFile(join(outDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('Home');
    expect(indexHtml).not.toContain('window.__INITIAL_DATA__');
    expect(indexHtml).not.toContain('<script type="module"');

    const blogHtml = await readFile(join(outDir, 'blog', 'hello-world', 'index.html'), 'utf-8');
    expect(blogHtml).toContain('Post hello-world');
  });

  it('renders catch-all static paths', async () => {
    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/docs/*',
        params: ['path'],
        isCatchAll: true,
        isIndex: false,
        prerender: true,
        getStaticPaths: async () => [{ params: { path: 'guide/getting-started' } }],
        loader: async ({ params }) => ({ path: params.path }),
        component: (({ data }: { data: { path: string } }) =>
          createElement('div', null, `Doc ${data.path}`)) as RouteRecord['component'],
      }),
    ];

    await prerender({
      routes,
      outDir,
      baseUrl: 'http://localhost',
    });

    const docHtml = await readFile(
      join(outDir, 'docs', 'guide', 'getting-started', 'index.html'),
      'utf-8'
    );

    expect(docHtml).toContain('Doc guide/getting-started');
  });
});
