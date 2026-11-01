import { GameError, ROOM_TTL_SECONDS, type Room } from "./engine.js";

export interface Store {
  read(code: string): Promise<string | null>;
  compareAndSwap(
    code: string,
    previous: string | null,
    next: string,
  ): Promise<boolean>;
  allow(key: string, limit: number): Promise<boolean>;
}
export class MemoryStore implements Store {
  private data = new Map<string, { value: string; expires: number }>();
  private rates = new Map<string, { count: number; until: number }>();
  async read(code: string): Promise<string | null> {
    const entry = this.data.get(code);
    if (!entry || entry.expires <= Date.now()) {
      this.data.delete(code);
      return null;
    }
    return entry.value;
  }
  async compareAndSwap(
    code: string,
    previous: string | null,
    next: string,
  ): Promise<boolean> {
    const entry = this.data.get(code);
    const current = entry && entry.expires > Date.now() ? entry.value : null;
    if (current !== previous) return false;
    this.data.set(code, {
      value: next,
      expires: Date.now() + ROOM_TTL_SECONDS * 1000,
    });
    // Keep the local-only store bounded during long development sessions.
    if (this.data.size > 1000)
      for (const [key, value] of this.data)
        if (value.expires < Date.now()) this.data.delete(key);
    return true;
  }
  async allow(key: string, limit: number): Promise<boolean> {
    let value = this.rates.get(key);
    if (!value || value.until < Date.now()) {
      value = { count: 0, until: Date.now() + 60_000 };
      this.rates.set(key, value);
    }
    if (this.rates.size > 1000)
      for (const [id, entry] of this.rates)
        if (entry.until < Date.now()) this.rates.delete(id);
    return ++value.count <= limit;
  }
}

export const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (not current and ARGV[1] == '') or current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`;
const RATE_SCRIPT = `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return n`;

export class RedisStore implements Store {
  constructor(
    private url: string,
    private token: string,
  ) {}
  private async command(args: (string | number)[]): Promise<unknown> {
    const result = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!result.ok) throw new Error("Shared storage request failed.");
    const body = (await result.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error("Shared storage command failed.");
    return body.result;
  }
  async read(code: string) {
    return (await this.command(["GET", `vault-run:room:${code}`])) as
      string | null;
  }
  async compareAndSwap(code: string, previous: string | null, next: string) {
    return (
      (await this.command([
        "EVAL",
        CAS_SCRIPT,
        1,
        `vault-run:room:${code}`,
        previous ?? "",
        next,
        ROOM_TTL_SECONDS,
      ])) === 1
    );
  }
  async allow(key: string, limit: number) {
    return (
      Number(
        await this.command(["EVAL", RATE_SCRIPT, 1, `vault-run:rate:${key}`]),
      ) <= limit
    );
  }
}

let cached: Store | undefined;
export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    if (!url.startsWith("https://"))
      throw new GameError(
        "The shared storage URL must use HTTPS.",
        503,
        "setup",
      );
    return (cached = new RedisStore(url, token));
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new GameError(
      "Multiplayer is not connected yet. The site owner needs to connect Upstash Redis and redeploy. See DEPLOY.md in the project.",
      503,
      "setup",
    );
  return (cached = new MemoryStore());
}
export async function updateRoom<T>(
  store: Store,
  code: string,
  update: (room: Room) => T,
): Promise<T> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const previous = await store.read(code);
    if (!previous)
      throw new GameError(
        "Room not found or expired. Check the code, or create a new room.",
        404,
      );
    const room = JSON.parse(previous) as Room;
    const result = update(room);
    if (JSON.stringify(room) === previous) return result;
    room.version++;
    if (await store.compareAndSwap(code, previous, JSON.stringify(room)))
      return result;
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 20)));
  }
  throw new GameError("The room is busy. Please try your move again.", 409);
}
