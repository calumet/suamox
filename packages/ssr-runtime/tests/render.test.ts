import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderPage } from '../src/index';
import type { RouteRecord, LoaderContext } from '../src/index';

function createMockRoute(overrides: Partial<RouteRecord>): RouteRecord {
  return {
    path: '/',
    filePath: '/pages/index.tsx',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    component: (() => createElement('div', { id: 'root' })) as any,
    layouts: [],
    params: [],
    isCatchAll: false,
    isIndex: true,
    priority: 0,
    ...overrides,
  };
}

function createMockRequest(url: string): Request {
  return new Request(url);
}

describe('renderPage', () => {
  it('should return 404 for non-matching route', async () => {
    const routes: RouteRecord[] = [createMockRoute({ path: '/about' })];
    const request = createMockRequest('http://localhost:3000/contact');

    const result = await renderPage({
      pathname: '/contact',
      request,
      routes,
    });

    expect(result.status).toBe(404);
    expect(result.html).toContain('404');
  });

  it('should render custom 404 page when present', async () => {
    const NotFoundPage = () => createElement('div', null, 'Custom 404');
    const routes: RouteRecord[] = [createMockRoute({ path: '/404', component: NotFoundPage })];
    const request = createMockRequest('http://localhost:3000/missing');

    const result = await renderPage({
      pathname: '/missing',
      request,
      routes,
    });

    expect(result.status).toBe(404);
    expect(result.html).toContain('Custom 404');
  });

  it('should return 200 for matching static route', async () => {
    const routes: RouteRecord[] = [createMockRoute({ path: '/about' })];
    const request = createMockRequest('http://localhost:3000/about');

    const result = await renderPage({
      pathname: '/about',
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain('<div id="root">');
  });

  it('should execute loader and include data', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async () => ({ title: 'Test Page', count: 42 }));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/test',
        loader,
      }),
    ];
    const request = createMockRequest('http://localhost:3000/test');

    const result = await renderPage({
      pathname: '/test',
      request,
      routes,
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(result.initialData).toEqual({ title: 'Test Page', count: 42 });
  });

  it('should pass correct context to loader', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async (ctx: LoaderContext) => ctx);

    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/blog/:slug',
        params: ['slug'],
        loader,
      }),
    ];
    const request = createMockRequest('http://localhost:3000/blog/hello?foo=bar');

    await renderPage({
      pathname: '/blog/hello',
      request,
      routes,
    });

    expect(loader).toHaveBeenCalledTimes(1);
    const context = loader.mock.calls[0]![0];

    expect(context.params).toEqual({ slug: 'hello' });
    expect(context.url.pathname).toBe('/blog/hello');
    expect(context.query.get('foo')).toBe('bar');
    expect(context.request).toBe(request);
  });

  it('should return 500 if loader throws error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async () => {
      throw new Error('Loader failed');
    });

    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/error',
        loader,
      }),
    ];
    const request = createMockRequest('http://localhost:3000/error');

    const result = await renderPage({
      pathname: '/error',
      request,
      routes,
    });

    expect(result.status).toBe(500);
    expect(result.html).toContain('500');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Loader error:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  it('should handle route without loader', async () => {
    const routes: RouteRecord[] = [createMockRoute({ path: '/simple' })];
    const request = createMockRequest('http://localhost:3000/simple');

    const result = await renderPage({
      pathname: '/simple',
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.initialData).toBeNull();
  });

  it('should handle dynamic routes with params', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async ({ params }: LoaderContext) => ({
      userId: params.userId,
      postId: params.postId,
    }));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/users/:userId/posts/:postId',
        params: ['userId', 'postId'],
        loader,
      }),
    ];
    const request = createMockRequest('http://localhost:3000/users/123/posts/456');

    const result = await renderPage({
      pathname: '/users/123/posts/456',
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.initialData).toEqual({
      userId: '123',
      postId: '456',
    });
  });

  it('should handle query parameters', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async ({ query }: LoaderContext) => ({
      search: query.get('q'),
      page: query.get('page'),
    }));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/search',
        loader,
      }),
    ];
    const request = createMockRequest('http://localhost:3000/search?q=test&page=2');

    const result = await renderPage({
      pathname: '/search',
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.initialData).toEqual({
      search: 'test',
      page: '2',
    });
  });

  it('should handle catch-all routes', async () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const loader = vi.fn(async ({ params }: LoaderContext) => ({
      path: params.path,
    }));

    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/docs/*',
        params: ['path'],
        isCatchAll: true,
        loader,
      }),
    ];
    const request = createMockRequest('http://localhost:3000/docs/guide/intro');

    const result = await renderPage({
      pathname: '/docs/guide/intro',
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.initialData).toEqual({
      path: 'guide/intro',
    });
  });

  it('should render layouts around the page', async () => {
    const LayoutA = ({ children }: { children: ReactNode }) =>
      createElement('div', { id: 'layout-a' }, children);
    const LayoutB = ({ children }: { children: ReactNode }) =>
      createElement('section', { id: 'layout-b' }, children);
    const Page = () => createElement('main', null, 'Layout Content');

    const routes: RouteRecord[] = [
      createMockRoute({
        path: '/layout',
        component: Page,
        layouts: [LayoutA, LayoutB],
      }),
    ];
    const request = createMockRequest('http://localhost:3000/layout');

    const result = await renderPage({
      pathname: '/layout',
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain('layout-a');
    expect(result.html).toContain('layout-b');
    expect(result.html).toContain('Layout Content');
    expect(result.html.indexOf('layout-a')).toBeLessThan(result.html.indexOf('layout-b'));
  });

  it('should handle root route', async () => {
    const routes: RouteRecord[] = [createMockRoute({ path: '/' })];
    const request = createMockRequest('http://localhost:3000/');

    const result = await renderPage({
      pathname: '/',
      request,
      routes,
    });

    expect(result.status).toBe(200);
    expect(result.html).toContain('<div id="root">');
  });
});
