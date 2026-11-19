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
    const existing = (await this.get<number>(key)) || 0;
    const next = Number(existing) + 1;
    await this.set(key, next);
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

  constructor() {
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      this.redis = new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      });
      logger.info("[REDIS] Upstash Redis client initialized");
    } else {
      this.memoryFallback = new MemoryCacheFallback();
      logger.warn("[REDIS WARNING] UPSTASH_REDIS_REST_URL not configured. Using in-memory fallback cache.");
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.redis) {
        return await this.redis.get<T>(key);
      }
      return await this.memoryFallback!.get<T>(key);
    } catch (err) {
      logger.error(`Redis GET error for key ${key}`, err);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      if (this.redis) {
        if (ttlSeconds) {
          await this.redis.set(key, value, { ex: ttlSeconds });
        } else {
          await this.redis.set(key, value);
        }
      } else {
        await this.memoryFallback!.set(key, value, { ex: ttlSeconds });
      }
    } catch (err) {
      logger.error(`Redis SET error for key ${key}`, err);
    }
  }

  async del(...keys: string[]): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.del(...keys);
      } else {
        await this.memoryFallback!.del(...keys);
      }
    } catch (err) {
      logger.error(`Redis DEL error for keys: ${keys.join(", ")}`, err);
    }
  }

  /**
   * Acquire a distributed lock. Returns true if lock was acquired, false otherwise.
   * Useful for background jobs and idempotency locking.
   */
  async acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    const key = `lock:${lockKey}`;
    try {
      if (this.redis) {
        // NX sets if Not eXists
        const res = await this.redis.set(key, "locked", { nx: true, ex: ttlSeconds });
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

  /**
   * Distributed sliding window rate limiter
   */
  async checkRateLimit(
    identifier: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ success: boolean; remaining: number; reset: number }> {
    const key = `ratelimit:${identifier}`;
    try {
      if (this.redis) {
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, windowSeconds);
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
      return { success: true, remaining: limit, reset: Date.now() };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (this.redis) {
        const ping = await this.redis.ping();
        return ping === "PONG";
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const cache = new DistributedCacheService();
