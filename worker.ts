import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
// @ts-ignore
import manifest from '__STATIC_CONTENT_MANIFEST';
import api from './src/api';

const app = new Hono();

// Serve static assets explicitly
app.use('/assets/*', serveStatic({ manifest }));

// Root HTML
app.get('/', serveStatic({ path: 'index.html', manifest }));

// Mount the API routes
app.route('/', api);

// SPA fallback for any other route
app.get('*', serveStatic({ path: 'index.html', manifest }));

export default app;
