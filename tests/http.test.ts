import test from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import handler from "../api/game.ts";

test("real HTTP: Vercel handler supports separate clients, private sync, validation, and cache protection", async () => {
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = req as VercelRequest;
      request.body = Buffer.concat(chunks).toString();
      const response = res as VercelResponse;
      response.status = (code: number) => {
        res.statusCode = code;
        return response;
      };
      response.json = (body: unknown) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
        return response;
      };
      await handler(request, response);
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const send = (body: Record<string, unknown>, token = "") =>
    fetch(url + "/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: url,
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(url + "/api/game")).status, 405);
    const created = await send({ type: "create", name: "Host" });
    assert.equal(created.status, 200);
    assert.ok(created.headers.get("cache-control")?.includes("no-store"));
    const host = await created.json();
    const joined = await send({
      type: "join",
      code: host.snapshot.code,
      name: "Friend",
    });
    assert.equal(joined.status, 200);
    const friend = await joined.json();
    const started = await send(
      { type: "start", code: host.snapshot.code },
      host.token,
    );
    assert.equal(started.status, 200);
    const start = await started.json();
    const choice = {
      type: "choose",
      code: host.snapshot.code,
      round: 1,
      gameId: start.snapshot.gameId,
      move: "steal",
    };
    assert.equal((await send(choice, host.token)).status, 200);
    const privateSync = await (
      await send({ type: "sync", code: host.snapshot.code }, friend.token)
    ).json();
    assert.equal(privateSync.snapshot.ownMove, null);
    assert.ok(!JSON.stringify(privateSync).includes("steal"));
    const revealed = await (
      await send({ ...choice, move: "guard" }, friend.token)
    ).json();
    assert.equal(revealed.snapshot.phase, "reveal");
    assert.deepEqual(
      revealed.snapshot.players.map((p: { score: number }) => p.score),
      [-3, 6],
    );
    const crossSite = await fetch(url, {
      method: "POST",
      headers: { Origin: "https://other.example" },
      body: "{}",
    });
    assert.equal(crossSite.status, 403);
    const malformedOrigin = await fetch(url, {
      method: "POST",
      headers: { Origin: "invalid" },
      body: "{}",
    });
    assert.equal(malformedOrigin.status, 403);
    assert.equal(
      (await fetch(url, { method: "POST", body: "{invalid" })).status,
      400,
    );
    assert.equal(
      (await fetch(url, { method: "POST", body: "x".repeat(5000) })).status,
      413,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
