import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateHTML, renderPage, resolveRouteModule } from './index';
import type { RouteRecord } from './index';

interface PrerenderAssets {
  scripts?: string[];
  preloadScripts?: string[];
  styles?: string[];
}

export interface PrerenderOptions {
  routes: RouteRecord[];
  outDir: string;
  baseUrl?: string;
  scripts?: string[];
  styles?: string[];
  preloadScripts?: string[];
  resolveAssets?: (ctx: {
    route: RouteRecord;
    pathname: string;
  }) => PrerenderAssets | Promise<PrerenderAssets>;
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

type ManifestEntry = {
  file: string;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
};

type Manifest = Record<string, ManifestEntry>;

function toManifestKey(rootDir: string, filePath: string): string | null {
  const relativePath = relative(rootDir, filePath).replace(/\\/g, '/');
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return null;
  }
  return relativePath;
}

function collectStylesFromManifest(manifest: Manifest, keys: string[], prefix = ''): string[] {
  const resolvedStyles = new Set<string>();
  const visited = new Set<string>();
  const resolvedPrefix = prefix.replace(/\/+$/, '');

  const toHref = (path: string): string => {
    const normalizedPath = path.replace(/^\/+/, '');
    return resolvedPrefix ? `${resolvedPrefix}/${normalizedPath}` : `/${normalizedPath}`;
  };

  const visit = (key: string): void => {
    if (visited.has(key)) {
      return;
    }
    visited.add(key);

    const entry = manifest[key];
    if (!entry) {
      return;
    }

    for (const cssPath of entry.css ?? []) {
      resolvedStyles.add(toHref(cssPath));
    }

    for (const importKey of entry.imports ?? []) {
      visit(importKey);
    }

    for (const importKey of entry.dynamicImports ?? []) {
      visit(importKey);
    }
  };

  for (const key of keys) {
    visit(key);
  }

  return Array.from(resolvedStyles);
}

export async function prerender(options: PrerenderOptions): Promise<void> {
  const {
    routes,
    outDir,
    baseUrl = 'http://localhost',
    scripts = [],
    styles = [],
    preloadScripts = [],
    resolveAssets,
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

  const renderRoute = async (pathname: string, route: RouteRecord): Promise<void> => {
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const url = new URL(normalizedPath, baseUrl);
    const result = await renderPage({
      pathname: normalizedPath,
      request: new Request(url),
      routes,
    });
    const resolvedAssets = resolveAssets
      ? await resolveAssets({ pathname: normalizedPath, route })
      : undefined;
    const routeScripts = [...scripts, ...(resolvedAssets?.scripts ?? [])];
    const routeStyles = [...styles, ...(resolvedAssets?.styles ?? [])];
    const routePreloadScripts = [...preloadScripts, ...(resolvedAssets?.preloadScripts ?? [])];

    const html = generateHTML({
      html: `<div id="root">${result.html}</div>`,
      head: result.head,
      initialData: result.initialData,
      includeInitialDataScript,
      scripts: routeScripts,
      styles: routeStyles,
      preloadScripts: routePreloadScripts,
    });

    const { dir, filePath } = getOutputPath(normalizedPath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, html);
  };

  for (const route of routes) {
    const resolvedRoute = await resolveRouteModule(route);

    if (resolvedRoute.csr) {
      continue;
    }

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
        await renderRoute(pathname, resolvedRoute);
      }
      continue;
    }

    await renderRoute(resolvedRoute.path, resolvedRoute);
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

  let clientBuildDir = resolvedClientDir;
  let isLegacyClientOutput = false;

  if (!(await pathExists(clientBuildDir))) {
    const legacyClientDir = resolvedDistDir;
    const legacyManifest = resolve(legacyClientDir, '.vite', 'manifest.json');

    if (!clientDir && (await pathExists(legacyManifest))) {
      clientBuildDir = legacyClientDir;
      isLegacyClientOutput = true;
      console.warn(
        '[suamox] Client build output detected in dist/. This layout is legacy; migrate to dist/client.'
      );
    } else {
      throw new Error('Client build output not found. Run the client build before SSG.');
    }
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

  const manifestPath = resolve(clientBuildDir, '.vite', 'manifest.json');
  let manifest: Manifest = {};
  if (await pathExists(manifestPath)) {
    try {
      const rawManifest = await readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(rawManifest) as Manifest;
    } catch {
      console.warn('[suamox] Could not read Vite manifest. Static HTML may miss CSS links.');
    }
  } else {
    console.warn('[suamox] Vite manifest not found. Static HTML may miss CSS links.');
  }

  const resolveRouteStyles = (route: RouteRecord): string[] => {
    if (Object.keys(manifest).length === 0) {
      return [];
    }

    const routeKey = route.filePath ? toManifestKey(rootDir, route.filePath) : null;
    const keys = ['index.html'];
    if (routeKey) {
      keys.push(routeKey);
    }

    return collectStylesFromManifest(manifest, keys, '/client');
  };

  await rm(resolvedOutDir, { recursive: true, force: true });

  await prerender({
    routes: serverModule.routes,
    outDir: resolvedOutDir,
    baseUrl,
    includeInitialDataScript: false,
    resolveAssets: ({ route }) => ({
      styles: resolveRouteStyles(route),
    }),
  });

  const staticClientDir = join(resolvedOutDir, 'client');
  if (isLegacyClientOutput) {
    await mkdir(staticClientDir, { recursive: true });
    const entries = await readdir(clientBuildDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'server' || entry.name === 'static') {
        continue;
      }
      const sourcePath = join(clientBuildDir, entry.name);
      const targetPath = join(staticClientDir, entry.name);
      await cp(sourcePath, targetPath, { recursive: true, force: true });
    }
  } else {
    await cp(clientBuildDir, staticClientDir, { recursive: true, force: true });
  }

  console.log(`SSG output written to ${resolvedOutDir}`);
}
