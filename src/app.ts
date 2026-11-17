import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./config/env.js";
import { requestIdMiddleware } from "./middlewares/request-id.js";
import { requestLoggerMiddleware } from "./middlewares/logger.js";
import { errorHandler } from "./middlewares/error-handler.js";
import { rateLimitMiddleware } from "./middlewares/rate-limit.js";
import { checkDatabaseHealth } from "./db/index.js";
import { cache } from "./lib/redis.js";

// Module Routers
import { productsRouter } from "./modules/products/products.routes.js";
import { collectionsRouter } from "./modules/collections/collections.routes.js";
import { cmsRouter } from "./modules/cms/cms.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";

export function createApp(): Hono {
  const app = new Hono();

  // 1. Global Middlewares
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim());
  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return allowedOrigins[0];
        return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
      },
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-Id", "Idempotency-Key", "X-Admin-Key", "X-VERIFY", "X-MERCHANT-ID"],
      exposeHeaders: ["X-Request-Id", "X-Idempotency-Replay", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
      credentials: true,
    }),
  );

  app.use("*", requestIdMiddleware);
  app.use("*", requestLoggerMiddleware);
  app.use("/api/*", rateLimitMiddleware({ limit: 300, windowSeconds: 60 }));

  // 2. Health Check
  app.get("/health", async (c) => {
    const isDbHealthy = await checkDatabaseHealth();
    const isRedisHealthy = await cache.healthCheck();

    const healthy = isDbHealthy && isRedisHealthy;
    const statusCode = healthy ? 200 : 503;

    return c.json(
      {
        status: healthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          database: isDbHealthy ? "connected" : "disconnected",
          redis: isRedisHealthy ? "connected" : "disconnected",
        },
      },
      statusCode,
    );
  });

  // 3. API Routers
  app.route("/api/products", productsRouter);
  app.route("/api/collections", collectionsRouter);
  app.route("/api/cms", cmsRouter);
  app.route("/api/orders", ordersRouter);
  app.route("/api/payments", paymentsRouter);
  app.route("/api/admin", adminRouter);

  // 4. Global Error & Not Found Handlers
  app.notFound((c) => {
    return c.json(
      {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Endpoint ${c.req.method} ${c.req.path} not found`,
        },
      },
      404,
    );
  });

  app.onError(errorHandler);

  return app;
}
