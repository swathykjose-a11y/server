import { createMiddleware } from "hono/factory";
import crypto from "crypto";

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const incomingId = c.req.header("X-Request-Id");
  const requestId = incomingId || crypto.randomUUID();

  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);

  await next();
});
