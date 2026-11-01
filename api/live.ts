import { createServer } from "node:http";
import { attachLive } from "../server/live.js";
import { PROTOCOL } from "../src/game/types.js";
const server = createServer((_req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(
    JSON.stringify({
      service: "Vault Breach live relay",
      transport: "WebSocket",
      version: "1.3.1",
      protocol: PROTOCOL,
    }),
  );
});
attachLive(server);
export default server;
