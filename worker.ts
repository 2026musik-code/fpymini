import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import api from './src/api';

const app = new Hono();

// Mount the API routes
app.route('/', api);

// Mount Cloudflare Pages or Worker static assets
app.get('/*', serveStatic({ root: './' })); // Setup standard static asset serving if configured

export default app;
