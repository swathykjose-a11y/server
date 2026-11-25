import crypto from "node:crypto";
import { createMiddleware } from "hono/factory";
import { cache } from "../lib/redis.js";
import { logger } from "../lib/logger.js";
import { safeEqual } from "../lib/auth.js";

interface IdempotencyRecord {
  status: "IN_PROGRESS" | "COMPLETED";
  fingerprint: string;
  responseStatus?: number;
  responseBody?: unknown;
  createdAt: number;
}

const DEFAULT_EXPIRATION_SECONDS = 86400; // 24 hours
const LOCK_TIMEOUT_SECONDS = 120; // 2 minutes

export const idempotencyMiddleware = (options?: { ttlSeconds?: number }) =>
  createMiddleware(async (c, next) => {
    // Only apply idempotency to mutating HTTP verbs
    if (!["POST", "PATCH", "PUT"].includes(c.req.method)) {
      return next();
    }

    const idempotencyKey = c.req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      return next();
    }
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      return c.json(
        {
          success: false,
          error: {
            code: "INVALID_IDEMPOTENCY_KEY",
            message: "Idempotency-Key must be 16 to 128 letters, numbers, underscores, or hyphens.",
          },
        },
        400,
      );
    }

    const rawBody = await c.req.raw.clone().text();
    if (rawBody.length > 100_000) {
      return c.json(
        {
          success: false,
          error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
        },
        413,
      );
    }
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${c.req.method}:${c.req.path}:${rawBody}`)
      .digest("hex");

    const ttl = options?.ttlSeconds || DEFAULT_EXPIRATION_SECONDS;
    const cacheKey = `idempotency:${idempotencyKey}`;
    const requestId = c.get("requestId") as string | undefined;

    // 1. Check existing record
    const existing = await cache.get<IdempotencyRecord>(cacheKey);

    if (existing) {
      if (!existing.fingerprint || !safeEqual(existing.fingerprint, fingerprint)) {
        return c.json(
          {
            success: false,
            error: {
              code: "IDEMPOTENCY_KEY_REUSED",
              message: "This Idempotency-Key was already used for a different request.",
            },
          },
          409,
        );
      }

      if (existing.status === "IN_PROGRESS") {
        logger.warn(`Idempotency conflict: Request ${idempotencyKey} is already in progress`, undefined, requestId);
        return c.json(
          {
            success: false,
            error: {
              code: "IDEMPOTENCY_CONFLICT",
              message: "A request with this Idempotency-Key is currently being processed. Please retry shortly.",
            },
          },
          409,
        );
      }

      if (existing.status === "COMPLETED" && existing.responseBody !== undefined) {
        logger.info(`Idempotency replay: Returning cached response for ${idempotencyKey}`, undefined, requestId);
        c.header("X-Idempotency-Replay", "true");
        return c.json(existing.responseBody, (existing.responseStatus || 200) as any);
      }
    }

    // 2. Mark state as IN_PROGRESS with lock timeout
    const locked = await cache.acquireLock(`idemp_lock:${idempotencyKey}`, LOCK_TIMEOUT_SECONDS);
    if (!locked) {
      return c.json(
        {
          success: false,
          error: {
            code: "CONCURRENT_REQUEST",
            message: "Concurrent duplicate request detected.",
          },
        },
        409,
      );
    }

    await cache.set(
      cacheKey,
      { status: "IN_PROGRESS", fingerprint, createdAt: Date.now() },
      LOCK_TIMEOUT_SECONDS,
    );

    try {
      await next();

      // 3. Cache the completed response
      const responseStatus = c.res.status;
      if (responseStatus >= 200 && responseStatus < 300) {
        // Clone response to read body without consuming it
        try {
          const clonedRes = c.res.clone();
          const jsonBody = await clonedRes.json();
          await cache.set(
            cacheKey,
            {
              status: "COMPLETED",
              fingerprint,
              responseStatus,
              responseBody: jsonBody,
              createdAt: Date.now(),
            },
            ttl,
          );
        } catch {
          // Response wasn't json or already drained
        }
      } else {
        // If request failed with 4xx or 5xx, remove the in-progress key so user can retry
        await cache.del(cacheKey);
      }
    } catch (err) {
      // In case of unhandled error, remove the lock so user can retry
      await cache.del(cacheKey);
      throw err;
    } finally {
      await cache.releaseLock(`idemp_lock:${idempotencyKey}`);
    }
  });
