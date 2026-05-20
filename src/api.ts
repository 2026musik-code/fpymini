import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';

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

async function hashPassword(password: string) {
  // Simple hashing using WebCrypto
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "salt123");
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const JWT_SECRET = 'fypmini-secret-key-24';

api.post('/auth/register', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400);

  const key = `user_email:${email}`;
  let existing = null;
  if (c.env && c.env.patungan) {
    existing = await c.env.patungan.get(key);
  } else {
    existing = memoryCache.get(key)?.data;
  }

  if (existing) return c.json({ error: 'Email already exists' }, 400);

  const hashedPassword = await hashPassword(password);
  const uid = crypto.randomUUID();
  const user = {
    uid,
    email,
    passwordHash: hashedPassword,
    displayName: email.split('@')[0],
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
    dailyViews: 0,
    dailyViewsMax: 42,
    accountTier: "free",
    watchHistory: {},
    createdAt: Date.now()
  };

  if (c.env && c.env.patungan) {
    await c.env.patungan.put(key, uid);
    await c.env.patungan.put(`user:${uid}`, JSON.stringify(user));
  } else {
    memoryCache.set(key, { timestamp: Date.now(), data: uid });
    memoryCache.set(`user:${uid}`, { timestamp: Date.now(), data: JSON.stringify(user) });
  }

  const token = await sign({ uid }, JWT_SECRET);
  // Do not send passwordHash to client
  const { passwordHash: _, ...safeUser } = user;
  return c.json({ token, user: safeUser });
});

api.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400);

  const key = `user_email:${email}`;
  let uid = null;
  if (c.env && c.env.patungan) {
    uid = await c.env.patungan.get(key);
  } else {
    uid = memoryCache.get(key)?.data;
  }

  if (!uid) return c.json({ error: 'Invalid credentials' }, 401);

  let userStr = null;
  if (c.env && c.env.patungan) {
    userStr = await c.env.patungan.get(`user:${uid}`);
  } else {
    userStr = memoryCache.get(`user:${uid}`)?.data;
  }

  if (!userStr) return c.json({ error: 'User data not found' }, 500);
  
  const user = JSON.parse(userStr as string);
  const hashedPassword = await hashPassword(password);

  if (user.passwordHash !== hashedPassword) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = await sign({ uid }, JWT_SECRET);
  const { passwordHash: _, ...safeUser } = user;
  return c.json({ token, user: safeUser });
});

api.get('/user/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  
  const token = authHeader.split(' ')[1];
  try {
    const payload = await verify(token, JWT_SECRET, "HS256");
    const uid = payload.uid as string;
    
    let userStr = null;
    if (c.env && c.env.patungan) {
      userStr = await c.env.patungan.get(`user:${uid}`);
    } else {
      userStr = memoryCache.get(`user:${uid}`)?.data;
    }
    
    if (!userStr) return c.json({ error: 'User not found' }, 404);
    const user = JSON.parse(userStr as string);
    const { passwordHash: _, ...safeUser } = user;
    return c.json({ user: safeUser });
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

api.post('/user/update', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  
  const token = authHeader.split(' ')[1];
  try {
    const payload = await verify(token, JWT_SECRET, "HS256");
    const uid = payload.uid as string;
    
    let userStr = null;
    if (c.env && c.env.patungan) {
      userStr = await c.env.patungan.get(`user:${uid}`);
    } else {
      userStr = memoryCache.get(`user:${uid}`)?.data;
    }
    
    if (!userStr) return c.json({ error: 'User not found' }, 404);
    
    const user = JSON.parse(userStr as string);
    const updates = await c.req.json();
    
    // Only allow specific updates
    if (updates.watchHistory) {
      user.watchHistory = updates.watchHistory;
    }
    
    if (c.env && c.env.patungan) {
      await c.env.patungan.put(`user:${uid}`, JSON.stringify(user));
    } else {
      memoryCache.set(`user:${uid}`, { timestamp: Date.now(), data: JSON.stringify(user) });
    }
    
    return c.json({ success: true });
  } catch(error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
});

api.get('/admin/users', async (c) => {
  // basic admin auth check should be here, skipped for brevity or checking token inside
  let users: any[] = [];
  if (c.env && c.env.patungan) {
    const list = await c.env.patungan.list({ prefix: 'user:' });
    for (const key of list.keys) {
      if (key.name.includes('@')) continue; // Skip email lookup keys
      const userStr = await c.env.patungan.get(key.name);
      if (userStr) users.push(JSON.parse(userStr));
    }
  } else {
    // Memory fallback
    for (const [key, val] of memoryCache.entries()) {
      if (key.startsWith('user:') && !key.includes('@')) {
        users.push(JSON.parse(val.data as string));
      }
    }
  }
  return c.json({ users });
});

api.get('/admin/settings', async (c) => {
  let settingsStr = null;
  if (c.env && c.env.patungan) {
    settingsStr = await c.env.patungan.get('global_settings');
  } else {
    settingsStr = memoryCache.get('global_settings')?.data;
  }
  const settings = settingsStr ? JSON.parse(settingsStr as string) : { popupText: "", popupImageUrl: "", vipPrice: 0, adminPasscode: "" };
  return c.json({ settings });
});

api.post('/admin/settings', async (c) => {
  const settings = await c.req.json();
  if (c.env && c.env.patungan) {
    await c.env.patungan.put('global_settings', JSON.stringify(settings));
  } else {
    memoryCache.set('global_settings', { timestamp: Date.now(), data: JSON.stringify(settings) });
  }
  return c.json({ success: true });
});

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
