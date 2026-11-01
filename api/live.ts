import { createServer } from "node:http";
import { attachLive } from "../server/live.js";
const server = createServer((_req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(
    JSON.stringify({
      service: "Vault Breach live relay",
      transport: "WebSocket",
      version: "1.1.0",
      protocol: 2,
    }),
  );
});
attachLive(server);
export default server;
