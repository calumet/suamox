import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanRoutes } from '../src/scanner';

const writeFileWithDirs = async (filePath: string, contents: string): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
};

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

const normalizeList = (values: string[] | undefined): string[] =>
  (values ?? []).map(normalizePath);

describe('scanRoutes layouts', () => {
  it('collects layouts from root to leaf and skips layout files as routes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suamox-pages-'));
    const pagesDir = join(root, 'src', 'pages');

    const rootLayout = join(pagesDir, 'layout.tsx');
    const blogLayout = join(pagesDir, 'blog', 'layout.tsx');
    const adminLayout = join(pagesDir, '(admin)', 'layout.tsx');

    const rootPage = join(pagesDir, 'index.tsx');
    const blogIndex = join(pagesDir, 'blog', 'index.tsx');
    const dashboard = join(pagesDir, '(admin)', 'dashboard.tsx');

    await writeFileWithDirs(rootLayout, 'export default function Layout({ children }) { return children; }');
    await writeFileWithDirs(blogLayout, 'export default function Layout({ children }) { return children; }');
    await writeFileWithDirs(adminLayout, 'export default function Layout({ children }) { return children; }');

    await writeFileWithDirs(rootPage, 'export default function Page() { return null; }');
    await writeFileWithDirs(blogIndex, 'export default function Page() { return null; }');
    await writeFileWithDirs(dashboard, 'export default function Page() { return null; }');

    const result = await scanRoutes({
      pagesDir: 'src/pages',
      extensions: ['.tsx'],
      root,
    });

    const findRoute = (path: string) => result.routes.find((route) => route.path === path);
    const rootRoute = findRoute('/');
    const blogRoute = findRoute('/blog');
    const adminRoute = findRoute('/dashboard');

    expect(normalizeList(rootRoute?.layouts)).toEqual([rootLayout].map(normalizePath));
    expect(normalizeList(blogRoute?.layouts)).toEqual(
      [rootLayout, blogLayout].map(normalizePath)
    );
    expect(normalizeList(adminRoute?.layouts)).toEqual(
      [rootLayout, adminLayout].map(normalizePath)
    );

    const routeFiles = result.routes.map((route) => route.filePath);
    expect(routeFiles).not.toContain(rootLayout);
    expect(routeFiles).not.toContain(blogLayout);
    expect(routeFiles).not.toContain(adminLayout);
  });
});
