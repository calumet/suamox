import { describe, it, expect } from 'vitest';
import { generateRoutesModule } from '../src/codegen';
import type { RouteRecord } from '../src/types';

describe('generateRoutesModule', () => {
  it('should generate empty routes array for no routes', () => {
    const routes: RouteRecord[] = [];
    const code = generateRoutesModule(routes);

    expect(code).toContain('export const routes = [');
    expect(code).toContain('];');
    expect(code).toContain('export default routes;');
  });

  it('should generate imports and route objects for single route', () => {
    const routes: RouteRecord[] = [
      {
        path: '/about',
        filePath: '/project/src/pages/about.tsx',
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain('import Page0 from');
    expect(code).toContain('/project/src/pages/about.tsx');
    expect(code).toContain('path: "/about"');
    expect(code).toContain('component: Page0');
    expect(code).toContain('params: []');
    expect(code).toContain('isCatchAll: false');
    expect(code).toContain('isIndex: false');
    expect(code).toContain('priority: 110');
  });

  it('should generate multiple imports for multiple routes', () => {
    const routes: RouteRecord[] = [
      {
        path: '/',
        filePath: '/pages/index.tsx',
        params: [],
        isCatchAll: false,
        isIndex: true,
        segments: [],
        priority: 0,
      },
      {
        path: '/about',
        filePath: '/pages/about.tsx',
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain('import Page0 from');
    expect(code).toContain('import Page1 from');
    expect(code).toContain('/pages/index.tsx');
    expect(code).toContain('/pages/about.tsx');
  });

  it('should handle dynamic routes with params', () => {
    const routes: RouteRecord[] = [
      {
        path: '/blog/:slug',
        filePath: '/pages/blog/[slug].tsx',
        params: ['slug'],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 215,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain('path: "/blog/:slug"');
    expect(code).toContain('params: ["slug"]');
  });

  it('should handle catch-all routes', () => {
    const routes: RouteRecord[] = [
      {
        path: '/*',
        filePath: '/pages/[...all].tsx',
        params: ['all'],
        isCatchAll: true,
        isIndex: false,
        segments: [],
        priority: 101,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain('path: "/*"');
    expect(code).toContain('params: ["all"]');
    expect(code).toContain('isCatchAll: true');
  });

  it('should normalize Windows paths to forward slashes', () => {
    const routes: RouteRecord[] = [
      {
        path: '/about',
        filePath: '/home/user/project/src/pages/about.tsx',
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes);

    expect(code).toContain("import Page0 from '/home/user/project/src/pages/about.tsx'");
  });

  it('should generate valid JavaScript structure', () => {
    const routes: RouteRecord[] = [
      {
        path: '/blog/:id',
        filePath: '/pages/blog/[id].tsx',
        params: ['id'],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 215,
      },
    ];

    const code = generateRoutesModule(routes);

    // Should contain all expected exports
    expect(code).toContain('export const routes');
    expect(code).toContain('export default routes');

    // Should have valid route structure
    expect(code).toContain('path:');
    expect(code).toContain('component:');
    expect(code).toContain('filePath:');
  });

  it('should maintain route order', () => {
    const routes: RouteRecord[] = [
      {
        path: '/a',
        filePath: '/pages/a.tsx',
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
      {
        path: '/b',
        filePath: '/pages/b.tsx',
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
      {
        path: '/c',
        filePath: '/pages/c.tsx',
        params: [],
        isCatchAll: false,
        isIndex: false,
        segments: [],
        priority: 110,
      },
    ];

    const code = generateRoutesModule(routes);

    const aIndex = code.indexOf('path: "/a"');
    const bIndex = code.indexOf('path: "/b"');
    const cIndex = code.indexOf('path: "/c"');

    expect(aIndex).toBeLessThan(bIndex);
    expect(bIndex).toBeLessThan(cIndex);
  });
});
