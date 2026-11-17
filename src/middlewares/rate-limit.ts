import { createMiddleware } from "hono/factory";
import { cache } from "../lib/redis.js";

interface RateLimitOptions {
  limit?: number;
  windowSeconds?: number;
  keyGenerator?: (c: any) => string;
}

export const rateLimitMiddleware = (options?: RateLimitOptions) => {
  const limit = options?.limit || 100; // 100 requests
  const windowSeconds = options?.windowSeconds || 60; // per 1 minute

  return createMiddleware(async (c, next) => {
    // Generate identifier from IP or client header
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      "anonymous";

    const key = options?.keyGenerator ? options.keyGenerator(c) : `${c.req.path}:${ip}`;

    const { success, remaining, reset } = await cache.checkRateLimit(key, limit, windowSeconds);

    c.header("X-RateLimit-Limit", limit.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", Math.ceil(reset / 1000).toString());

    if (!success) {
      return c.json(
        {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please slow down.",
          },
        },
        429,
      );
    }

    return await next();
  });
};
