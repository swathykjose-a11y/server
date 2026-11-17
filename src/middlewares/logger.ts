import { createMiddleware } from "hono/factory";
import { logger } from "../lib/logger.js";

export const requestLoggerMiddleware = createMiddleware(async (c, next) => {
  const start = Date.now();
  const requestId = c.get("requestId") as string | undefined;
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  logger.info(`HTTP ${method} ${path} -> ${status} [${duration}ms]`, {
    method,
    path,
    status,
    durationMs: duration,
  }, requestId);
});
