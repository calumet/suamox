import { serve } from '@hono/node-server';
import { Hono } from 'hono';

// Placeholder server - will be replaced with createHonoApp in Phase 3
const app = new Hono();

app.get('*', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Suamox Example</title>
      </head>
      <body>
        <div id="root">
          <h1>Suamox Framework</h1>
          <p>Server is running. SSR will be implemented in Phase 3.</p>
        </div>
      </body>
    </html>
  `);
});

const port = 3000;
console.log(`Server running at http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
