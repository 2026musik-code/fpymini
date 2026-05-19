import { Hono } from 'hono';

type Bindings = {
  patungan: any;
  vpsai: any;
};

const api = new Hono<{ Bindings: Bindings }>().basePath('/api');

// Simple memory cache fallback if KV is not available (e.g. local dev)
const memoryCache = new Map<string, { timestamp: number, data: any }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function getCache(c: any, key: string) {
  if (c.env && c.env.patungan) {
    try {
      const cached = await c.env.patungan.get(key, "json");
      if (cached) return cached;
    } catch(e) { return null; }
  }
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

async function setCache(c: any, key: string, data: any) {
  if (c.env && c.env.patungan) {
    try {
      await c.env.patungan.put(key, JSON.stringify(data), { expirationTtl: 3600 });
    } catch (e) {}
  } else {
    memoryCache.set(key, { timestamp: Date.now(), data });
  }
}

api.get("/proxy", async (c) => {
  try {
    const apiKey = c.req.header("x-api-key");
    if (!apiKey) return c.json({ error: "Missing API Key" }, 401);

    const action = c.req.query("action");
    const id = c.req.query("id");
    const provider = c.req.query("provider") || "reelshort";

    const cacheKey = `${provider}_${action}_${id || ''}`;
    const cached = await getCache(c, cacheKey);
    if (cached) return c.json(cached);

    let url = `https://www.cutad.web.id/api/public/${provider}?action=${action}`;
    if (id) url += `&id=${encodeURIComponent(id)}`;

    const response = await fetch(url, {
      headers: { "x-api-key": apiKey }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return c.json({ error: "Invalid response from upstream API", details: text }, 500);
    }

    await setCache(c, cacheKey, data);
    return c.json(data, response.status as any);
  } catch (error: any) {
    console.error("Error proxying request:", error);
    return c.json({ error: "Failed to proxy request", details: error.message }, 500);
  }
});

api.get("/videos", async (c) => {
  try {
    const apiKey = c.req.header("x-api-key");
    if (!apiKey) return c.json({ error: "Missing API Key" }, 401);

    const provider = c.req.query("provider") || "reelshort";
    const cacheKey = `videos_rank_${provider}`;
    
    const cached = await getCache(c, cacheKey);
    if (cached) return c.json(cached);

    const response = await fetch(`https://www.cutad.web.id/api/public/${provider}?action=rank`, {
      headers: { "x-api-key": apiKey }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return c.json({ error: "Invalid response from upstream API", details: text }, 500);
    }

    await setCache(c, cacheKey, data);
    return c.json(data, response.status as any);
  } catch (error: any) {
    return c.json({ error: "Failed to proxy request", details: error.message }, 500);
  }
});

api.get("/cors-proxy", async (c) => {
  const targetUrl = c.req.query("url");
  let referer = c.req.query("referer");
  if (!targetUrl) return c.text("No url provided", 400);

  try {
    const urlObj = new URL(targetUrl);
    if (!referer) referer = urlObj.origin;

    const response = await fetch(targetUrl, {
      headers: {
        "Origin": new URL(referer).origin,
        "Referer": referer,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    const contentType = response.headers.get("content-type");
    if (targetUrl.includes(".m3u8") || (contentType && contentType.includes("mpegurl"))) {
      let text = await response.text();

      // Rewrite standalone relative paths
      text = text.replace(/^[ \t]*(?!#|http)[ \t]*(.+)[ \t]*$/gm, (match, path) => {
        const absoluteUrl = new URL(path.trim(), targetUrl).toString();
        return `/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer as string)}`;
      });
      // Rewrite URI="..."
      text = text.replace(/URI="([^"]+)"/g, (match, path) => {
        if (path.startsWith("http")) {
          return `URI="/api/cors-proxy?url=${encodeURIComponent(path)}&referer=${encodeURIComponent(referer as string)}"`;
        }
        const absoluteUrl = new URL(path, targetUrl).toString();
        return `URI="/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer as string)}"`;
      });
      
      if (contentType) c.header("Content-Type", contentType);
      c.header("Access-Control-Allow-Origin", "*");
      return c.text(text);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      if (contentType) c.header("Content-Type", contentType);
      c.header("Access-Control-Allow-Origin", "*");
      return c.body(arrayBuffer);
    }
  } catch (error) {
    return c.text("Proxy error", 500);
  }
});

api.get("/subtitle-proxy", async (c) => {
  const targetUrl = c.req.query("url");
  if (!targetUrl) return c.text("No url provided", 400);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    let text = await response.text();

    if (!text.trim().startsWith("WEBVTT")) {
      text = "WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
    }

    c.header("Content-Type", "text/vtt; charset=utf-8");
    c.header("Access-Control-Allow-Origin", "*");
    return c.text(text);
  } catch(err) {
    return c.text("Subtitle error", 500);
  }
});

export default api;
