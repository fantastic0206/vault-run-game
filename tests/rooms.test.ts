import test from "node:test";
import assert from "node:assert/strict";
import { roomRequest } from "../server/rooms.ts";
import { ApiError, MemoryStorage } from "../server/storage.ts";
const T = 1800000000000;
async function crew() {
  const store = new MemoryStorage();
  const host = await roomRequest(
    { type: "create", name: "Rook" },
    "",
    "host",
    store,
    T,
  );
  const friend = await roomRequest(
    { type: "join", code: host.room.code, name: "Ghost" },
    "",
    "guest",
    store,
    T,
  );
  return { store, host, friend, code: host.room.code };
}
async function fail(fn: () => Promise<unknown>, status: number) {
  await assert.rejects(
    fn,
    (error) => error instanceof ApiError && error.status === status,
  );
}
test("rooms expose public seats, never tokens or hashes", async () => {
  const { host, friend, code } = await crew();
  assert.equal(friend.room.players.length, 2);
  assert.notEqual(host.token, friend.token);
  assert.ok(!JSON.stringify(friend.room).includes("hash"));
  assert.ok(!JSON.stringify(friend.room).includes(host.token!));
  assert.match(code, /^[A-Z2-9]{6}$/);
});
test("concurrent joins are atomic and enforce the four-player maximum", async () => {
  const store = new MemoryStorage(),
    host = await roomRequest(
      { type: "create", name: "Lead" },
      "",
      "ip",
      store,
      T,
    );
  const attempts = await Promise.allSettled(
    Array.from({ length: 7 }, (_, i) =>
      roomRequest(
        { type: "join", code: host.room.code, name: "Crew " + i },
        "",
        "ip-" + i,
        store,
        T,
      ),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 3);
  const state = await roomRequest(
    { type: "sync", code: host.room.code },
    host.token!,
    "ip",
    store,
    T,
  );
  assert.equal(state.room.players.length, 4);
});
test("only the host starts a live crew, finishes the current mission, and opens a rematch", async () => {
  const { store, host, friend, code } = await crew();
  await fail(
    () => roomRequest({ type: "start", code }, friend.token!, "ip", store, T),
    403,
  );
  await fail(
    () => roomRequest({ type: "start", code }, host.token!, "ip", store, T),
    409,
  );
  for (const seat of [host, friend])
    await roomRequest(
      { type: "sync", code, live: true },
      seat.token!,
      "ip",
      store,
      T,
    );
  const started = await roomRequest(
    { type: "start", code, live: true },
    host.token!,
    "ip",
    store,
    T,
  );
  assert.equal(started.room.phase, "playing");
  await fail(
    () => roomRequest({ type: "join", code, name: "Late" }, "", "ip", store, T),
    409,
  );
  await fail(
    () =>
      roomRequest(
        { type: "finish", code, live: true, gameId: "old", result: "won" },
        host.token!,
        "ip",
        store,
        T,
      ),
    409,
  );
  const ended = await roomRequest(
    {
      type: "finish",
      code,
      live: true,
      gameId: started.room.gameId,
      result: "won",
    },
    host.token!,
    "ip",
    store,
    T,
  );
  assert.equal(ended.room.result, "won");
  const rematch = await roomRequest(
    { type: "rematch", code },
    host.token!,
    "ip",
    store,
    T,
  );
  assert.equal(rematch.room.phase, "lobby");
  assert.equal(rematch.room.result, null);
});
test("invalid tokens, codes, names, and duplicate codenames are rejected", async () => {
  const { store, host, code } = await crew();
  await fail(
    () => roomRequest({ type: "sync", code }, "0".repeat(64), "ip", store, T),
    401,
  );
  await fail(
    () =>
      roomRequest(
        { type: "join", code: "../foo", name: "New" },
        "",
        "ip",
        store,
        T,
      ),
    400,
  );
  await fail(
    () => roomRequest({ type: "join", code, name: "rook" }, "", "ip", store, T),
    409,
  );
  await fail(
    () => roomRequest({ type: "create", name: " " }, "", "ip", store, T),
    400,
  );
  await fail(
    () =>
      roomRequest(
        { type: "sync", code: "ZZZZZZ" },
        host.token!,
        "ip",
        store,
        T,
      ),
    404,
  );
});
test("host disconnect ends the raid cleanly and a connected operative can regroup", async () => {
  const { store, host, friend, code } = await crew();
  for (const seat of [host, friend])
    await roomRequest(
      { type: "sync", code, live: true },
      seat.token!,
      "ip",
      store,
      T,
    );
  await roomRequest(
    { type: "start", code, live: true },
    host.token!,
    "ip",
    store,
    T,
  );
  const aborted = await roomRequest(
    { type: "sync", code, live: true },
    friend.token!,
    "ip",
    store,
    T + 19000,
  );
  assert.equal(aborted.room.hostId, friend.id);
  assert.equal(aborted.room.phase, "finished");
  assert.equal(aborted.room.result, "aborted");
  const next = await roomRequest(
    { type: "rematch", code },
    friend.token!,
    "ip",
    store,
    T + 19000,
  );
  assert.equal(next.room.phase, "lobby");
  assert.equal(next.room.players.length, 1);
});
test("anonymous room creation is rate-limited", async () => {
  const store = new MemoryStorage();
  for (let i = 0; i < 30; i++)
    await roomRequest({ type: "create", name: "Test" }, "", "ip", store, T);
  await fail(
    () => roomRequest({ type: "create", name: "Test" }, "", "ip", store, T),
    429,
  );
});
