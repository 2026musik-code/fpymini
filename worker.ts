import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
// @ts-ignore
import manifest from '__STATIC_CONTENT_MANIFEST';
import api from './src/api';

const app = new Hono();

// Mount the API routes
app.route('/', api);

// Serve static assets from Cloudflare Workers Sites
app.get('/*', serveStatic({ root: './', manifest }));
app.get('*', serveStatic({ path: './index.html', manifest })); // SPA fallback

export default app;
