import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context } from 'hono';
import type { ViteDevServer } from 'vite';
import pc from 'picocolors';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import type { RouteRecord, RenderResult } from '@suamox/ssr-runtime';
import { renderPage, generateHTML } from '@suamox/ssr-runtime';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface HonoAdapterOptions {
  onRequest?: (c: Context) => void | Promise<void>;
  onBeforeRender?: (ctx: any) => Promise<any>;
  onAfterRender?: (result: RenderResult) => Promise<RenderResult>;
}

export interface DevHandlerOptions extends HonoAdapterOptions {
  vite: ViteDevServer;
  root?: string;
}

export interface ProdHandlerOptions extends HonoAdapterOptions {
  clientDir?: string;
  serverEntry?: string;
  root?: string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Create a Hono app with SSR support
 */
export function createHonoApp(_options: HonoAdapterOptions = {}): Hono {
  const app = new Hono();

  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  return app;
}

/**
 * Create and start a server (dev or prod based on NODE_ENV)
 */
export async function createServer(options: {
  port?: number;
  clientDir?: string;
  serverEntry?: string;
  onRequest?: (c: Context) => void | Promise<void>;
  onBeforeRender?: (ctx: any) => Promise<any>;
  onAfterRender?: (result: RenderResult) => Promise<RenderResult>;
}): Promise<void> {
  const { port = 3000, ...adapterOptions } = options;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    // Production mode - use standard serve
    const { serve } = await import('@hono/node-server');
    const app = createProdHandler(adapterOptions);
    console.log(`Production server running at http://localhost:${port}`);
    serve({ fetch: app.fetch, port });
  } else {
    // Development mode - need to integrate Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const { createServer: createNodeServer } = await import('node:http');

    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    const app = createDevHandler({ vite, ...adapterOptions });

    // Create HTTP server that uses both Vite middleware and Hono
    const server = createNodeServer((req, res) => {
      // Try Vite middleware first
      vite.middlewares(req, res, async () => {
        // If Vite doesn't handle it, use Hono
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            headers[key] = value;
          }
        }

        const request = new Request(`http://${req.headers.host || 'localhost'}${req.url || '/'}`, {
          method: req.method,
          headers,
        });

        const response = await app.fetch(request);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

        if (response.body) {
          const reader = response.body.getReader();
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              return;
            }
            res.write(value);
            return pump();
          };
          await pump();
        } else {
          res.end();
        }
      });
    });

    server.listen(port);
    console.log(`Development server running at http://localhost:${port}`);
  }
}

/**
 * Create development handler with Vite integration
 */
export function createDevHandler(options: DevHandlerOptions): Hono {
  const { vite, onRequest, onBeforeRender, onAfterRender } = options;
  const app = createHonoApp(options);

  // SSR handler for pages (Vite middleware is handled in createServer)
  app.use('*', async (c) => {
    const url = new URL(c.req.url);

    try {
      // Execute onRequest hook
      if (onRequest) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await onRequest(c);
      }

      // Load virtual:pages module
      const { routes } = (await vite.ssrLoadModule('virtual:pages')) as { routes: RouteRecord[] };

      // Execute onBeforeRender hook
      let renderContext = { pathname: url.pathname, request: c.req.raw, routes };
      if (onBeforeRender) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        renderContext = await onBeforeRender(renderContext);
      }

      // Render page
      let result = await renderPage(renderContext);

      // Execute onAfterRender hook
      if (onAfterRender) {
        result = await onAfterRender(result);
      }

      // Read and transform index.html
      const template = await vite.transformIndexHtml(
        url.pathname,
        `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${result.head || ''}
  </head>
  <body>
    <div id="root">${result.html}</div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>`
      );

      // Inject initial data
      const finalHtml = template.replace(
        '</body>',
        `<script>window.__INITIAL_DATA__ = ${JSON.stringify(result.initialData || null)};</script></body>`
      );

      return c.html(finalHtml, result.status as 200 | 404 | 500);
    } catch (error) {
      // Let Vite handle errors with stack trace
      vite.ssrFixStacktrace(error as Error);
      console.error(pc.red('[SSR Error]'), error);

      return c.html('<h1>500 - Internal Server Error</h1>', 500);
    }
  });

  return app;
}

/**
 * Create production handler for serving built assets
 */
export function createProdHandler(options: ProdHandlerOptions): Hono {
  const {
    clientDir = 'dist/client',
    serverEntry = 'dist/server/entry-server.js',
    onRequest,
    onBeforeRender,
    onAfterRender,
    root = process.cwd(),
  } = options;

  const app = createHonoApp(options);

  // Convert relative server entry path to absolute file URL for dynamic import
  const serverEntryPath = resolve(root, serverEntry);
  const serverEntryURL = pathToFileURL(serverEntryPath).href;

  // Read Vite manifest to get hashed asset names
  const manifestPath = resolve(root, clientDir, '.vite/manifest.json');
  let manifest: Record<string, { file: string }> = {};
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, { file: string }>;
  } catch {
    console.warn('[Hono Adapter] Could not read Vite manifest, client assets may not load');
  }

  // Get the entry client script from manifest
  const entryClientScript = manifest['index.html']?.file
    ? `/${manifest['index.html'].file}`
    : '/assets/index.js';

  // Serve static assets from client build directory
  app.use('/assets/*', serveStatic({ root: clientDir }));

  // SSR handler - only for non-asset routes
  app.use('*', async (c) => {
    // Skip if it's requesting an asset file
    if (c.req.path.startsWith('/assets/')) {
      return c.notFound();
    }
    const url = new URL(c.req.url);

    try {
      // Execute onRequest hook
      if (onRequest) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await onRequest(c);
      }

      // Import server entry (this should export routes)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const serverModule = await import(serverEntryURL);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const routes = serverModule.routes as RouteRecord[];

      if (!routes) {
        throw new Error('Server entry must export routes');
      }

      // Execute onBeforeRender hook
      let renderContext = { pathname: url.pathname, request: c.req.raw, routes };
      if (onBeforeRender) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        renderContext = await onBeforeRender(renderContext);
      }

      // Render page
      let result = await renderPage(renderContext);

      // Execute onAfterRender hook
      if (onAfterRender) {
        result = await onAfterRender(result);
      }

      // Generate full HTML
      const html = generateHTML({
        html: `<div id="root">${result.html}</div>`,
        head: result.head,
        initialData: result.initialData,
        scripts: [entryClientScript],
      });

      return c.html(html, result.status as 200 | 404 | 500);
    } catch (error) {
      console.error(pc.red('[SSR Error]'), error);

      const errorHtml = generateHTML({
        html: '<div id="root"><h1>500 - Internal Server Error</h1></div>',
        head: '<title>Error</title>',
      });

      return c.html(errorHtml, 500);
    }
  });

  return app;
}

// Export types
export type { Context } from 'hono';
export type { ViteDevServer } from 'vite';
