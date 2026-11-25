import { createMiddleware } from "hono/factory";
import { cache } from "../lib/redis.js";
import { env } from "../config/env.js";
import { safeEqual } from "../lib/auth.js";

type AddressSource = {
  env?: { incoming?: { socket?: { remoteAddress?: string | null } } };
  req: { header: (name: string) => string | undefined };
};

function isLoopback(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  return normalized === "127.0.0.1" || normalized === "::1";
}

/** Socket address, unless a local or authenticated proxy forwards the client IP. */
export function clientAddress(c: AddressSource): string {
  const remote = c.env?.incoming?.socket?.remoteAddress || "";
  const presentedSecret = c.req.header("x-proxy-secret") || "";
  const proxyAuthenticated = Boolean(
    env.TRUSTED_PROXY_SECRET &&
      presentedSecret &&
      safeEqual(presentedSecret, env.TRUSTED_PROXY_SECRET),
  );

  if (isLoopback(remote) || proxyAuthenticated) {
    const forwarded = (c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "")
      .split(",")[0]
      .trim();
    if (/^[0-9a-fA-F:.]+$/.test(forwarded) && forwarded.length <= 64) {
      return forwarded;
    }
  }

  return remote || "unknown";
}

interface RateLimitOptions {
  limit?: number;
  windowSeconds?: number;
  failClosed?: boolean;
  keyGenerator?: (c: any) => string;
}

export const rateLimitMiddleware = (options?: RateLimitOptions) => {
  const limit = options?.limit || 100; // 100 requests
  const windowSeconds = options?.windowSeconds || 60; // per 1 minute

  return createMiddleware(async (c, next) => {
    const ip = clientAddress(c);

    const key = options?.keyGenerator ? options.keyGenerator(c) : `${c.req.path}:${ip}`;

    const { success, remaining, reset } = await cache.checkRateLimit(
      key,
      limit,
      windowSeconds,
      options?.failClosed,
    );

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
