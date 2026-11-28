import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// In-memory fallback cache when Upstash Redis credentials are not provided
class MemoryCacheFallback {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as unknown as T;
    }
  }

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<string> {
    const stringVal = typeof value === "string" ? value : JSON.stringify(value);
    const expiresAt = options?.ex ? Date.now() + options.ex * 1000 : undefined;
    this.store.set(key, { value: stringVal, expiresAt });
    return "OK";
  }

  async setnx(key: string, value: unknown, exSeconds?: number): Promise<number> {
    const existing = await this.get(key);
    if (existing !== null) return 0;
    await this.set(key, value, { ex: exSeconds });
    return 1;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key);
    const expired = Boolean(entry?.expiresAt && Date.now() > entry.expiresAt);
    const current = !entry || expired ? 0 : Number(JSON.parse(entry.value)) || 0;
    const next = current + 1;
    this.store.set(key, {
      value: JSON.stringify(next),
      expiresAt: !entry || expired ? undefined : entry.expiresAt,
    });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }
}

export class DistributedCacheService {
  private redis: Redis | null = null;
  private memoryFallback: MemoryCacheFallback | null = null;
  private initialized = false;

  /**
   * Lazily resolve Upstash Redis client so Cloudflare Worker env bindings
   * populated inside fetch() are picked up properly.
   */
  private getClient(): Redis | null {
    if (this.redis) return this.redis;

    const url = process.env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
      this.redis = new Redis({ url, token });
      this.initialized = true;
      logger.info("[REDIS] Upstash Redis client initialized");
      return this.redis;
    }

    if (!this.initialized) {
      this.initialized = true;
      this.memoryFallback = new MemoryCacheFallback();
      logger.warn("[REDIS WARNING] UPSTASH_REDIS_REST_URL/TOKEN not configured. Using in-memory fallback cache.");
    }
    if (!this.memoryFallback) {
      this.memoryFallback = new MemoryCacheFallback();
    }
    return null;
  }

  async get<T>(key: string): Promise<T | null> {
    const client = this.getClient();
    try {
      if (client) {
        return await client.get<T>(key);
      }
      return await this.memoryFallback!.get<T>(key);
    } catch (err) {
      logger.error(`Redis GET error for key ${key}`, err);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const client = this.getClient();
    try {
      if (client) {
        if (ttlSeconds) {
          await client.set(key, value, { ex: ttlSeconds });
        } else {
          await client.set(key, value);
        }
      } else {
        await this.memoryFallback!.set(key, value, { ex: ttlSeconds });
      }
    } catch (err) {
      logger.error(`Redis SET error for key ${key}`, err);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const client = this.getClient();
    try {
      if (client) {
        await client.del(...keys);
      } else {
        await this.memoryFallback!.del(...keys);
      }
    } catch (err) {
      logger.error(`Redis DEL error for keys: ${keys.join(", ")}`, err);
    }
  }

  async flush(): Promise<void> {
    const client = this.getClient();
    try {
      if (client) {
        await client.flushdb();
      } else if (this.memoryFallback) {
        this.memoryFallback = new MemoryCacheFallback();
      }
    } catch (err) {
      logger.error("Redis FLUSH error", err);
    }
  }

  async acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    const key = `lock:${lockKey}`;
    const client = this.getClient();
    try {
      if (client) {
        const res = await client.set(key, "locked", { nx: true, ex: ttlSeconds });
        return res === "OK";
      } else {
        const res = await this.memoryFallback!.setnx(key, "locked", ttlSeconds);
        return res === 1;
      }
    } catch (err) {
      logger.error(`Failed to acquire lock ${key}`, err);
      return false;
    }
  }

  async releaseLock(lockKey: string): Promise<void> {
    const key = `lock:${lockKey}`;
    await this.del(key);
  }

  async checkRateLimit(
    identifier: string,
    limit: number,
    windowSeconds: number,
    failClosed = false,
  ): Promise<{ success: boolean; remaining: number; reset: number }> {
    const key = `ratelimit:${identifier}`;
    const client = this.getClient();
    try {
      if (client) {
        const count = await client.incr(key);
        if (count === 1) {
          await client.expire(key, windowSeconds);
        } else {
          const ttl = await client.ttl(key);
          if (ttl < 0) await client.expire(key, windowSeconds);
        }
        const remaining = Math.max(0, limit - count);
        return {
          success: count <= limit,
          remaining,
          reset: Date.now() + windowSeconds * 1000,
        };
      } else {
        const count = await this.memoryFallback!.incr(key);
        if (count === 1) {
          await this.memoryFallback!.expire(key, windowSeconds);
        }
        const remaining = Math.max(0, limit - count);
        return {
          success: count <= limit,
          remaining,
          reset: Date.now() + windowSeconds * 1000,
        };
      }
    } catch (err) {
      logger.error(`Rate limit check error for ${identifier}`, err);
      return { success: !failClosed, remaining: 0, reset: Date.now() };
    }
  }

  async healthCheck(): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try {
      const ping = await client.ping();
      return ping === "PONG";
    } catch {
      return false;
    }
  }
}

export const cache = new DistributedCacheService();
