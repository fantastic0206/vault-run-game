import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  GameError,
  newPlayer,
  newRoom,
  resolveRound,
  ROUND_MS,
  REVEAL_MS,
  type Room,
} from "../server/engine.ts";
import { MemoryStore, RedisStore, CAS_SCRIPT } from "../server/store.ts";
import { gameRequest } from "../server/service.ts";
import type { Move, Snapshot } from "../src/types.ts";

const T = 1_800_000_000_000;
async function createCrew(size = 2) {
  const store = new MemoryStore();
  let now = T;
  const created = await gameRequest(
    { type: "create", name: "Fox", avatar: 0 },
    "",
    "test-ip",
    store,
    now,
  );
  const seats = [{ token: created.token!, id: created.playerId! }];
  let state = created.snapshot;
  for (let i = 1; i < size; i++) {
    const joined = await gameRequest(
      { type: "join", code: state.code, name: `Crew ${i}`, avatar: i },
      "",
      "test-ip",
      store,
      now,
    );
    seats.push({ token: joined.token!, id: joined.playerId! });
    state = joined.snapshot;
  }
  return {
    store,
    seats,
    code: state.code,
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    set now(value) {
      now = value;
    },
    async send(index: number, type: string, extra = {}) {
      const result = await gameRequest(
        {
          type,
          code: state.code,
          gameId: state.gameId,
          round: state.round,
          ...extra,
        },
        seats[index].token,
        `ip-${index}`,
        store,
        now,
      );
      state = result.snapshot;
      return state;
    },
  };
}
async function expectGameError(
  callback: () => Promise<unknown>,
  status: number,
) {
  await assert.rejects(
    callback,
    (error: unknown) => error instanceof GameError && error.status === status,
  );
}

test("separate anonymous players join by code; snapshots never expose credentials", async () => {
  const crew = await createCrew();
  assert.equal(crew.state.players.length, 2);
  assert.equal(crew.state.hostId, crew.seats[0].id);
  assert.notEqual(crew.seats[0].token, crew.seats[1].token);
  const serialized = JSON.stringify(crew.state);
  assert.ok(!serialized.includes("token"));
  assert.ok(!serialized.includes(crew.seats[0].token));
  assert.ok(!serialized.includes("moves"));
  assert.equal((await crew.send(0, "sync")).selfId, crew.seats[0].id);
});

test("host authorization, minimum player count, and fake token are enforced", async () => {
  const alone = await createCrew(1);
  await expectGameError(() => alone.send(0, "start"), 409);
  const crew = await createCrew();
  await expectGameError(() => crew.send(1, "start"), 403);
  await expectGameError(
    () =>
      gameRequest(
        { type: "sync", code: crew.code },
        "0".repeat(64),
        "test-ip",
        crew.store,
        crew.now,
      ),
    401,
  );
  await expectGameError(
    () =>
      gameRequest(
        { type: "sync", code: crew.code },
        "",
        "test-ip",
        crew.store,
        crew.now,
      ),
    401,
  );
});

test("locked choices stay secret from other players and cannot be changed", async () => {
  const crew = await createCrew();
  await crew.send(0, "start");
  const host = await crew.send(0, "choose", { move: "steal" });
  assert.equal(host.ownMove, "steal");
  const other = await crew.send(1, "sync");
  assert.equal(other.ownMove, null);
  assert.deepEqual(other.history, []);
  assert.equal(other.players[0].locked, true);
  assert.ok(!JSON.stringify(other).includes("steal"));
  await expectGameError(() => crew.send(0, "choose", { move: "guard" }), 409);
  await crew.send(0, "choose", { move: "steal" });
  assert.equal(crew.state.history.length, 0);
});

test("two players complete all three heists with correct scores, winner, and rematch", async () => {
  const crew = await createCrew();
  await crew.send(0, "start");
  const moves: Move[][] = [
    ["steal", "loot"],
    ["loot", "guard"],
    ["steal", "guard"],
  ];
  const expected = [
    [16, 0],
    [40, 2],
    [37, 8],
  ];
  for (let round = 1; round <= 3; round++) {
    assert.equal(crew.state.phase, "choosing");
    assert.equal(crew.state.round, round);
    crew.now += 1000;
    await crew.send(0, "choose", { move: moves[round - 1][0] });
    await crew.send(1, "choose", { move: moves[round - 1][1] });
    assert.equal(crew.state.phase, "reveal");
    assert.equal(crew.state.history.length, round);
    assert.deepEqual(
      crew.state.players.map((p) => p.score),
      expected[round - 1],
    );
    await crew.send(0, "ready");
    await crew.send(1, "ready");
  }
  assert.equal(crew.state.phase, "finished");
  assert.equal(crew.state.deadline, null);
  assert.equal(
    crew.state.players.reduce((a, b) => (a.score > b.score ? a : b)).id,
    crew.seats[0].id,
  );
  const oldGame = crew.state.gameId;
  await expectGameError(() => crew.send(1, "rematch"), 403);
  await crew.send(0, "rematch");
  assert.equal(crew.state.code, crew.code);
  assert.equal(crew.state.phase, "lobby");
  assert.notEqual(crew.state.gameId, oldGame);
  assert.deepEqual(
    crew.state.players.map((p) => p.score),
    [0, 0],
  );
  assert.deepEqual(crew.state.history, []);
  await crew.send(0, "start");
  await expectGameError(
    () => crew.send(0, "choose", { move: "steal", gameId: oldGame }),
    409,
  );
});

test("ties remain ties across a complete three-round game", async () => {
  const crew = await createCrew();
  await crew.send(0, "start");
  for (let i = 0; i < 3; i++) {
    await crew.send(0, "choose", { move: "loot" });
    await crew.send(1, "choose", { move: "loot" });
    await crew.send(0, "ready");
    await crew.send(1, "ready");
  }
  assert.equal(crew.state.phase, "finished");
  assert.deepEqual(
    crew.state.players.map((p) => p.score),
    [36, 36],
  );
});

test("all payoff cases, rounding, no thieves, and negative scores", () => {
  const scenarios: { moves: (Move | "skip")[]; expected: number[] }[] = [
    { moves: ["loot", "loot"], expected: [8, 8] },
    { moves: ["loot", "loot", "loot"], expected: [5, 5, 5] },
    { moves: ["loot", "steal"], expected: [0, 16] },
    { moves: ["steal", "steal", "loot"], expected: [-3, -3, 16] },
    { moves: ["steal", "guard", "loot"], expected: [-3, 6, 16] },
    { moves: ["steal", "guard", "guard"], expected: [-3, 6, 6] },
    { moves: ["steal", "steal", "guard"], expected: [-3, -3, 6] },
    { moves: ["guard", "guard"], expected: [2, 2] },
    { moves: ["guard", "loot"], expected: [2, 16] },
    { moves: ["skip", "skip"], expected: [0, 0] },
    { moves: ["skip", "steal"], expected: [0, 16] },
  ];
  for (const { moves, expected } of scenarios) {
    const players = moves.map((_, i) => newPlayer(`Player ${i}`, i, T).player);
    const room = newRoom("TEST22", players[0], T);
    room.players = players;
    room.round = 1;
    room.phase = "choosing";
    moves.forEach((move, i) => {
      room.moves[players[i].id] = move;
    });
    resolveRound(room, T);
    assert.deepEqual(
      room.players.map((p) => p.score),
      expected,
      moves.join(", "),
    );
  }
});

test("server deadline rejects late moves; missed moves earn zero; reveal auto-advances", async () => {
  const crew = await createCrew();
  await crew.send(0, "start");
  await crew.send(0, "choose", { move: "loot" });
  crew.now += ROUND_MS + 1;
  await expectGameError(() => crew.send(1, "choose", { move: "steal" }), 409);
  await crew.send(0, "sync");
  assert.equal(crew.state.phase, "reveal");
  assert.deepEqual(
    crew.state.players.map((p) => p.score),
    [16, 0],
  );
  assert.equal(crew.state.history[0].players[1].move, "skip");
  crew.now += REVEAL_MS + 1;
  await crew.send(0, "sync");
  assert.equal(crew.state.phase, "choosing");
  assert.equal(crew.state.round, 2);
  assert.equal(crew.state.deadline, crew.now + ROUND_MS);
});

test("eight simultaneous joins never exceed eight seats or lose a player", async () => {
  const crew = await createCrew(1);
  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      gameRequest(
        { type: "join", code: crew.code, name: `Guest ${i}`, avatar: i },
        "",
        `guest-${i}`,
        crew.store,
        crew.now,
      ),
    ),
  );
  assert.equal(attempts.filter((p) => p.status === "fulfilled").length, 7);
  assert.equal(attempts.filter((p) => p.status === "rejected").length, 1);
  const state = await crew.send(0, "sync");
  assert.equal(state.players.length, 8);
  assert.equal(new Set(state.players.map((p) => p.id)).size, 8);
});

test("eight simultaneous moves resolve exactly once with no lost choices or double scoring", async () => {
  const crew = await createCrew(8);
  await crew.send(0, "start");
  const round = crew.state.round;
  const gameId = crew.state.gameId;
  await Promise.all(
    crew.seats.map((seat) =>
      gameRequest(
        { type: "choose", code: crew.code, round, gameId, move: "loot" },
        seat.token,
        seat.id,
        crew.store,
        crew.now,
      ),
    ),
  );
  const state = await crew.send(0, "sync");
  assert.equal(state.phase, "reveal");
  assert.equal(state.history.length, 1);
  assert.deepEqual(
    state.players.map((p) => p.score),
    Array(8).fill(2),
  );
  await expectGameError(() => crew.send(0, "choose", { move: "loot" }), 409);
  assert.equal((await crew.send(0, "sync")).history.length, 1);
});

test("simultaneous ready votes advance once and stale round requests cannot vote in a later round", async () => {
  const crew = await createCrew();
  await crew.send(0, "start");
  await crew.send(0, "choose", { move: "guard" });
  await crew.send(1, "choose", { move: "guard" });
  const gameId = crew.state.gameId;
  await Promise.all(
    crew.seats.map((seat) =>
      gameRequest(
        { type: "ready", code: crew.code, round: 1, gameId },
        seat.token,
        seat.id,
        crew.store,
        crew.now,
      ),
    ),
  );
  const current = await crew.send(0, "sync");
  assert.equal(current.round, 2);
  assert.equal(current.phase, "choosing");
  await expectGameError(
    () => crew.send(0, "choose", { move: "loot", round: 1 }),
    409,
  );
  await expectGameError(() => crew.send(0, "ready", { round: 1 }), 409);
});

test("refresh restores the same player, score, and secret move", async () => {
  const crew = await createCrew();
  await crew.send(0, "start");
  await crew.send(0, "choose", { move: "guard" });
  const fresh = await gameRequest(
    { type: "sync", code: crew.code },
    crew.seats[0].token,
    "different-ip",
    crew.store,
    crew.now,
  );
  assert.equal(fresh.snapshot.selfId, crew.seats[0].id);
  assert.equal(fresh.snapshot.ownMove, "guard");
  assert.equal(fresh.snapshot.players.length, 2);
});

test("host disconnect transfers control; old offline seats can be removed from lobby", async () => {
  const crew = await createCrew();
  crew.now += 46_000;
  await crew.send(1, "sync");
  assert.equal(crew.state.hostId, crew.seats[1].id);
  assert.equal(crew.state.players[0].online, false);
  await crew.send(1, "remove", { targetId: crew.seats[0].id });
  assert.equal(crew.state.players.length, 1);
  await expectGameError(() => crew.send(0, "sync"), 401);
});

test("leaving mid-round does not stall the game and transfers the host", async () => {
  const crew = await createCrew();
  await crew.send(0, "start");
  await crew.send(0, "leave");
  const next = await crew.send(1, "choose", { move: "loot" });
  assert.equal(next.hostId, crew.seats[1].id);
  assert.equal(next.phase, "reveal");
  assert.equal(next.history[0].players[0].move, "skip");
  assert.equal(next.players[1].score, 16);
  await crew.send(1, "ready");
  assert.equal(crew.state.round, 2);
  await crew.send(1, "choose", { move: "guard" });
  assert.equal(crew.state.phase, "reveal");
  assert.equal(crew.state.history[1].players[0].move, "skip");
});

test("full, started, missing, duplicate name, invalid action, and invalid avatar inputs", async () => {
  const crew = await createCrew();
  await expectGameError(
    () =>
      gameRequest(
        { type: "join", code: crew.code, name: "fox" },
        "",
        "new-ip",
        crew.store,
        crew.now,
      ),
    409,
  );
  await expectGameError(
    () =>
      gameRequest(
        { type: "join", code: "ZZZZZZ", name: "New" },
        "",
        "new-ip",
        crew.store,
        crew.now,
      ),
    404,
  );
  await expectGameError(
    () =>
      gameRequest(
        { type: "join", code: "../etc", name: "New" },
        "",
        "new-ip",
        crew.store,
        crew.now,
      ),
    400,
  );
  await expectGameError(
    () =>
      gameRequest(
        { type: "create", name: " " },
        "",
        "new-ip",
        crew.store,
        crew.now,
      ),
    400,
  );
  await expectGameError(() => crew.send(0, "unknown"), 400);
  await crew.send(0, "start");
  await expectGameError(
    () =>
      gameRequest(
        { type: "join", code: crew.code, name: "New" },
        "",
        "new-ip",
        crew.store,
        crew.now,
      ),
    409,
  );
  await expectGameError(() => crew.send(0, "choose", { move: "win" }), 400);
  assert.equal(newPlayer("<Tester>", 1000, T).player.avatar, 0);
  assert.equal(newPlayer("<Tester>", 1, T).player.name, "Tester");
});

test("unauthenticated request floods are rate-limited", async () => {
  const store = new MemoryStore();
  for (let i = 0; i < 40; i++)
    await gameRequest({ type: "create", name: "Test" }, "", "one-ip", store, T);
  await expectGameError(
    () => gameRequest({ type: "create", name: "Test" }, "", "one-ip", store, T),
    429,
  );
});

test("Redis adapter uses atomic compare-and-swap, a TTL, and server-only REST authorization", async () => {
  const originalFetch = globalThis.fetch;
  const commands: unknown[][] = [];
  let value: string | null = null;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://redis.example.test");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer server-secret",
    );
    const command = JSON.parse(String(init?.body)) as unknown[];
    commands.push(command);
    let result: unknown;
    if (command[0] === "GET") result = value;
    else if (command[1] === CAS_SCRIPT) {
      if (value === (command[4] || null)) {
        value = String(command[5]);
        result = 1;
      } else result = 0;
      assert.equal(command[6], 21_600);
    } else result = 1;
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  try {
    const store = new RedisStore("https://redis.example.test", "server-secret");
    assert.equal(await store.read("TEST22"), null);
    assert.equal(await store.compareAndSwap("TEST22", null, "first"), true);
    assert.equal(
      await store.compareAndSwap("TEST22", null, "overwrite"),
      false,
    );
    assert.equal(await store.compareAndSwap("TEST22", "first", "second"), true);
    assert.equal(await store.read("TEST22"), "second");
    assert.equal(await store.allow("limited", 40), true);
    assert.ok(
      commands.every(
        (command) =>
          command.includes("vault-run:room:TEST22") ||
          command.includes("vault-run:rate:limited"),
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production refuses an in-memory fallback when Redis is missing", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      "import { getStore } from './server/store.ts'; try { getStore(); process.exit(1) } catch (error) { if (error.status !== 503 || error.kind !== 'setup') throw error; console.log('Correctly refused unshared state') }",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        VERCEL: "1",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
        KV_REST_API_URL: "",
        KV_REST_API_TOKEN: "",
      },
    },
  );
  assert.equal(child.status, 0, child.stderr);
});
