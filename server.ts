import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const cache = new Map<string, { timestamp: number, data: any }>();
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour

  // Proxy route for generic actions
  app.get("/api/proxy", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] as string;
      if (!apiKey) {
        res.status(401).json({ error: "Missing API Key" });
        return;
      }

      const action = req.query.action as string;
      const id = req.query.id as string;
      const provider = (req.query.provider as string) || "reelshort";

      const cacheKey = `${provider}_${action}_${id || ''}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        res.json(cached.data);
        return;
      }

      let url = `https://www.cutad.web.id/api/public/${provider}?action=${action}`;
      if (id) {
        url += `&id=${encodeURIComponent(id)}`;
      }

      const response = await fetch(url, {
        headers: {
          "x-api-key": apiKey,
        },
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        res.status(500).json({ error: "Invalid response from upstream API", details: text });
        return;
      }
      
      cache.set(cacheKey, { timestamp: Date.now(), data });
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error("Error proxying request:", error);
      res.status(500).json({ error: "Failed to proxy request", details: error.message });
    }
  });

  // Proxy route for API
  app.get("/api/videos", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] as string;
      if (!apiKey) {
        res.status(401).json({ error: "Missing API Key" });
        return;
      }

      const provider = (req.query.provider as string) || "reelshort";
      const cacheKey = `videos_rank_${provider}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        res.json(cached.data);
        return;
      }

      // Proxy request to cutad.web.id
      const response = await fetch(`https://www.cutad.web.id/api/public/${provider}?action=rank`, {
        headers: {
          "x-api-key": apiKey,
        },
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse JSON from cutad API:", text);
        res.status(500).json({ error: "Invalid response from upstream API", details: text });
        return;
      }
      
      cache.set(cacheKey, { timestamp: Date.now(), data });
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error("Error fetching videos:", error);
      res.status(500).json({ error: "Failed to proxy request", details: error.message });
    }
  });

  // Proxy to bypass CORS for m3u8 and ts files (used by freereels)
  app.get("/api/cors-proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    let referer = req.query.referer as string;
    if (!targetUrl) return res.status(400).send("No url provided");

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
      if (contentType) res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (targetUrl.includes(".m3u8") || (contentType && contentType.includes("mpegurl"))) {
        let text = await response.text();
        
        // Rewrite standalone relative paths
        text = text.replace(/^[ \t]*(?!#|http)[ \t]*(.+)[ \t]*$/gm, (match, path) => {
          const absoluteUrl = new URL(path.trim(), targetUrl).toString();
          return `/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}`;
        });
        
        // Rewrite URI="..."
        text = text.replace(/URI="([^"]+)"/g, (match, path) => {
          if (path.startsWith("http")) {
            return `URI="/api/cors-proxy?url=${encodeURIComponent(path)}&referer=${encodeURIComponent(referer)}"`;
          }
          const absoluteUrl = new URL(path, targetUrl).toString();
          return `URI="/api/cors-proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(referer)}"`;
        });
        
        res.send(text);
      } else {
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      }
    } catch (error: any) {
      console.error("CORS Proxy Error:", error);
      res.status(500).send("Proxy error");
    }
  });

  // Subtitle proxy - Fetches SRT, converts to VTT, adds CORS
  app.get("/api/subtitle-proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("No url provided");
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      let text = await response.text();
      
      // Basic SRT to VTT conversion if needed
      if (!text.trim().startsWith("WEBVTT")) {
         text = "WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
      }
      
      res.setHeader("Content-Type", "text/vtt; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(text);
    } catch(err) {
      res.status(500).send("Subtitle error");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
