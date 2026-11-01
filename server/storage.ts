import Redis from "ioredis";
import type { World } from "../src/game/types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Listener = (data: string) => void;
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl: number): Promise<void>;
  cas(
    key: string,
    previous: string | null,
    next: string,
    ttl: number,
  ): Promise<boolean>;
  allow(key: string, limit: number): Promise<boolean>;
  publish(channel: string, data: string): Promise<void>;
  subscribe(channel: string, listener: Listener): Promise<() => void>;
}
export class MemoryStorage implements Storage {
  values = new Map<string, { data: string; until: number }>();
  channels = new Map<string, Set<Listener>>();
  rates = new Map<string, { count: number; until: number }>();
  async get(key: string) {
    const v = this.values.get(key);
    if (!v || v.until < Date.now()) {
      this.values.delete(key);
      return null;
    }
    return v.data;
  }
  async set(key: string, data: string, ttl: number) {
    this.values.set(key, { data, until: Date.now() + ttl * 1000 });
  }
  async cas(key: string, previous: string | null, next: string, ttl: number) {
    const entry = this.values.get(key),
      current = entry && entry.until > Date.now() ? entry.data : null;
    if (current !== previous) return false;
    this.values.set(key, { data: next, until: Date.now() + ttl * 1000 });
    return true;
  }
  async allow(key: string, limit: number) {
    let r = this.rates.get(key);
    if (!r || r.until < Date.now()) {
      r = { count: 0, until: Date.now() + 60000 };
      this.rates.set(key, r);
    }
    return ++r.count <= limit;
  }
  async publish(channel: string, data: string) {
    for (const fn of this.channels.get(channel) ?? [])
      queueMicrotask(() => fn(data));
  }
  async subscribe(channel: string, fn: Listener) {
    let listeners = this.channels.get(channel);
    if (!listeners) {
      listeners = new Set();
      this.channels.set(channel, listeners);
    }
    listeners.add(fn);
    return () => {
      listeners!.delete(fn);
      if (!listeners!.size) this.channels.delete(channel);
    };
  }
}
const CAS = `local v=redis.call('GET',KEYS[1]); if (not v and ARGV[1]=='') or v==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end; return 0`;
const RATE = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`;
export class RedisStorage implements Storage {
  private redis: Redis;
  private subscriber: Redis;
  private listeners = new Map<string, Set<Listener>>();
  constructor(url: string) {
    const opts = {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 6000,
      lazyConnect: true,
      enableReadyCheck: false,
    };
    this.redis = new Redis(url, opts);
    this.subscriber = new Redis(url, { ...opts, commandTimeout: undefined });
    this.redis.on("error", () => {});
    this.subscriber.on("error", () => {});
    this.subscriber.on("message", (channel, data) => {
      for (const fn of this.listeners.get(channel) ?? []) fn(data);
    });
  }
  async get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttl: number) {
    await this.redis.set(key, value, "EX", ttl);
  }
  async cas(key: string, previous: string | null, next: string, ttl: number) {
    return (
      (await this.redis.eval(CAS, 1, key, previous ?? "", next, ttl)) === 1
    );
  }
  async allow(key: string, limit: number) {
    return Number(await this.redis.eval(RATE, 1, "vb:rate:" + key)) <= limit;
  }
  async publish(channel: string, data: string) {
    await this.redis.publish(channel, data);
  }
  async subscribe(channel: string, fn: Listener) {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      try {
        await this.subscriber.subscribe(channel);
      } catch (error) {
        this.listeners.delete(channel);
        throw error;
      }
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) {
        this.listeners.delete(channel);
        void this.subscriber.unsubscribe(channel).catch(() => {});
      }
    };
  }
}
let storage: Storage | undefined;
export function getStorage(): Storage {
  if (storage) return storage;
  const url = process.env.REDIS_URL;
  if (url && !url.includes("YOUR_")) {
    if (process.env.VERCEL && !url.startsWith("rediss://"))
      throw new ApiError(
        "Co-op needs a secure rediss:// connection string. See DEPLOY.md.",
        503,
      );
    return (storage = new RedisStorage(url));
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production")
    throw new ApiError(
      "Co-op is not connected yet. Add REDIS_URL to this Vercel project and redeploy. Solo play works without setup.",
      503,
    );
  return (storage = new MemoryStorage());
}
export const roomKey = (code: string) => "vb:room:" + code;
export const liveChannel = (code: string) => "vb:live:" + code;
export const frameKey = (code: string, gameId: string) =>
  "vb:frame:" + code + ":" + gameId;
export async function checkpoint(
  store: Storage,
  code: string,
  gameId: string,
): Promise<World | null> {
  const value = await store.get(frameKey(code, gameId));
  return value ? JSON.parse(value) : null;
}
