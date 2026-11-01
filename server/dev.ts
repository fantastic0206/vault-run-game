import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer as createVite } from "vite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../api/room.js";
import { attachLive } from "./live.js";
const production = process.argv.includes("--production"),
  port = Number(process.env.PORT ?? 5173);
const server = createServer();
const vite = production
  ? null
  : await createVite({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
const live = attachLive(server);
server.on("request", async (req, res) => {
  if (req.url?.split("?")[0] === "/api/room") {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 4096) {
        res.writeHead(413);
        res.end('{"error":"Request too large."}');
        return;
      }
      chunks.push(chunk);
    }
    const request = req as VercelRequest;
    request.body = Buffer.concat(chunks).toString();
    const response = res as VercelResponse;
    response.status = (code: number) => {
      res.statusCode = code;
      return response;
    };
    response.json = (data: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
      return response;
    };
    await handler(request, response);
    return;
  }
  if (vite) {
    vite.middlewares(req, res);
    return;
  }
  try {
    const path = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    const file = resolve("dist", "." + (path === "/" ? "/index.html" : path));
    if (!file.startsWith(resolve("dist") + "/")) {
      res.writeHead(403);
      res.end();
      return;
    }
    const types: Record<string, string> = {
      html: "text/html",
      js: "text/javascript",
      css: "text/css",
      svg: "image/svg+xml",
    };
    res.setHeader(
      "Content-Type",
      types[file.split(".").pop()!] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log(`Vault Breach → http://localhost:${port}`),
);
process.on("SIGTERM", () => {
  live.close();
  server.close();
  void vite?.close();
});
