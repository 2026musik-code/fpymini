import http from "http";
import path from "path";
import fs from "fs";
import { getRequestListener } from "@hono/node-server";
import { createServer as createViteServer } from "vite";
import api from "./src/api";

async function startServer() {
  const PORT = 3000;
  let vite: any = null;

  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
  }

  const honoListener = getRequestListener(api.fetch);

  const server = http.createServer((req, res) => {
    // Check if the request is an API request
    if (req.url && req.url.startsWith("/api/")) {
      return honoListener(req, res);
    }

    // Serve via Vite in dev
    if (vite) {
      vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end("Not Found");
      });
      return;
    }

    // Serve static files in prod
    const distPath = path.join(process.cwd(), "dist");
    const filePath = path.join(distPath, req.url === "/" ? "index.html" : req.url || "");
    
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for SPA
        fs.readFile(path.join(distPath, "index.html"), (err, data) => {
          if (err) {
            res.statusCode = 404;
            res.end("Not Found");
            return;
          }
          res.setHeader("Content-Type", "text/html");
          res.end(data);
        });
        return;
      }

      // Infer basic mime types
      let contentType = "text/plain";
      if (filePath.endsWith(".html")) contentType = "text/html";
      else if (filePath.endsWith(".js") || filePath.endsWith(".cjs") || filePath.endsWith(".mjs")) contentType = "application/javascript";
      else if (filePath.endsWith(".css")) contentType = "text/css";
      else if (filePath.endsWith(".json")) contentType = "application/json";
      else if (filePath.endsWith(".png")) contentType = "image/png";
      else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";
      else if (filePath.endsWith(".svg")) contentType = "image/svg+xml";

      res.setHeader("Content-Type", contentType);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

