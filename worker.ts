import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
// @ts-ignore
import manifest from '__STATIC_CONTENT_MANIFEST';
import api from './src/api';

const app = new Hono();

// Serve static assets natively for anything the browser asks
app.use('/*', serveStatic({ manifest }));

// Mount the API routes
app.route('/api', api);

// SPA fallback for any other route (returns index.html)
app.get('*', async (c) => {
  const env = c.env as any;
  const manifestObj = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
  const key = manifestObj['index.html'];
  if (key && env.__STATIC_CONTENT) {
    const asset = await env.__STATIC_CONTENT.get(key, 'stream');
    if (asset) {
      return new Response(asset, { 
        headers: { 'Content-Type': 'text/html' } 
      });
    }
  }
  
  return c.text('Not Found (SPA index.html missing)', 404);
});

export default app;
