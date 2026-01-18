import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateHTML, renderPage, resolveRouteModule } from './index';
import type { RouteRecord } from './index';

export interface PrerenderOptions {
  routes: RouteRecord[];
  outDir: string;
  baseUrl?: string;
  scripts?: string[];
  includeInitialDataScript?: boolean;
}

export interface RunSsgOptions {
  rootDir?: string;
  distDir?: string;
  clientDir?: string;
  serverEntry?: string;
  outDir?: string;
  baseUrl?: string;
}

function isDynamicRoute(route: RouteRecord): boolean {
  return route.path.includes(':') || route.path.includes('*');
}

function encodeCatchAll(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function resolvePrerenderPath(route: RouteRecord, params: Record<string, string>): string {
  if (route.isCatchAll) {
    const paramName = route.params[0];
    if (!paramName) {
      throw new Error(`Catch-all route ${route.path} is missing a param name`);
    }
    const rawValue = params[paramName];
    if (rawValue === undefined) {
      throw new Error(`Missing param "${paramName}" for route ${route.path}`);
    }
    const encoded = encodeCatchAll(String(rawValue));
    const basePath = route.path.slice(0, -2);

    if (!basePath) {
      return encoded ? `/${encoded}` : '/';
    }

    return encoded ? `${basePath}/${encoded}` : basePath;
  }

  let resolvedPath = route.path;
  for (const paramName of route.params) {
    const rawValue = params[paramName];
    if (rawValue === undefined) {
      throw new Error(`Missing param "${paramName}" for route ${route.path}`);
    }
    const encoded = encodeURIComponent(String(rawValue));
    resolvedPath = resolvedPath.replace(new RegExp(`:${paramName}(?=/|$)`, 'g'), encoded);
  }

  return resolvedPath;
}

export async function prerender(options: PrerenderOptions): Promise<void> {
  const {
    routes,
    outDir,
    baseUrl = 'http://localhost',
    scripts = [],
    includeInitialDataScript = false,
  } = options;

  const getOutputPath = (pathname: string): { dir: string; filePath: string } => {
    const normalizedPath = pathname === '' ? '/' : pathname;
    const parts = normalizedPath.split('/').filter(Boolean);
    const dir = parts.length === 0 ? outDir : join(outDir, ...parts);
    return {
      dir,
      filePath: join(dir, 'index.html'),
    };
  };

  await mkdir(outDir, { recursive: true });

  const renderRoute = async (pathname: string): Promise<void> => {
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const url = new URL(normalizedPath, baseUrl);
    const result = await renderPage({
      pathname: normalizedPath,
      request: new Request(url),
      routes,
    });

    const html = generateHTML({
      html: `<div id="root">${result.html}</div>`,
      head: result.head,
      initialData: result.initialData,
      includeInitialDataScript,
      scripts,
    });

    const { dir, filePath } = getOutputPath(normalizedPath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, html);
  };

  for (const route of routes) {
    const resolvedRoute = await resolveRouteModule(route);

    if (!resolvedRoute.prerender) {
      continue;
    }

    if (isDynamicRoute(resolvedRoute)) {
      if (!resolvedRoute.getStaticPaths) {
        throw new Error(
          `Route ${resolvedRoute.path} is dynamic but does not export getStaticPaths`
        );
      }

      const staticPaths = await resolvedRoute.getStaticPaths();
      for (const entry of staticPaths) {
        const pathname = resolvePrerenderPath(resolvedRoute, entry.params ?? {});
        await renderRoute(pathname);
      }
      continue;
    }

    await renderRoute(resolvedRoute.path);
  }
}

export async function runSsg(options: RunSsgOptions = {}): Promise<void> {
  const {
    rootDir = process.cwd(),
    distDir,
    clientDir,
    serverEntry,
    outDir,
    baseUrl = 'http://localhost',
  } = options;

  const resolvedDistDir = distDir ?? resolve(rootDir, 'dist');
  const resolvedClientDir = clientDir ?? resolve(resolvedDistDir, 'client');
  const resolvedServerEntry = serverEntry ?? resolve(resolvedDistDir, 'server', 'entry-server.js');
  const resolvedOutDir = outDir ?? resolve(resolvedDistDir, 'static');

  const pathExists = async (path: string): Promise<boolean> => {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  };

  if (!(await pathExists(resolvedClientDir))) {
    throw new Error('Client build output not found. Run the client build before SSG.');
  }

  if (!(await pathExists(resolvedServerEntry))) {
    throw new Error('SSR build output not found. Run the server build before SSG.');
  }

  const serverModule = (await import(pathToFileURL(resolvedServerEntry).href)) as {
    routes?: RouteRecord[];
  };

  if (!serverModule.routes) {
    throw new Error('SSR entry must export routes.');
  }

  await rm(resolvedOutDir, { recursive: true, force: true });

  await prerender({
    routes: serverModule.routes,
    outDir: resolvedOutDir,
    baseUrl,
    includeInitialDataScript: false,
  });

  const staticClientDir = join(resolvedOutDir, 'client');
  await cp(resolvedClientDir, staticClientDir, { recursive: true, force: true });

  console.log(`SSG output written to ${resolvedOutDir}`);
}
