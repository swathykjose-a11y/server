import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSentry } from "./config/sentry.js";
import { logger } from "./lib/logger.js";
import { emailService } from "./lib/resend.js";
import { closeDatabaseConnection } from "./db/index.js";

// 1. Initialize Sentry
initSentry();

// 2. Initialize Hono Application
const app = createApp();

// 3. Start Node.js HTTP Server
const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info(`[SERVER] Dainty Dazzle Backend Server listening on http://localhost:${info.port} (${env.NODE_ENV})`);
    logger.info(`[CORS] Allowed CORS Origins: ${env.CORS_ORIGIN}`);
    logger.info(`[ADMIN] Admin order notifications routing to: ${env.ADMIN_NOTIFICATION_EMAIL}`);
    logger.info(`[ALERTS] Developer server error alerts routing to: ${env.DEVELOPER_ALERT_EMAIL}`);
  },
);

// Process-level unhandled rejection & exception reporting
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection detected:", reason);
  emailService
    .sendServerErrorAlert({
      error: reason instanceof Error ? reason : new Error(String(reason)),
      context: "Process unhandledRejection",
    })
    .catch(() => {});
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception detected:", error);
  emailService
    .sendServerErrorAlert({
      error,
      context: "Process uncaughtException",
    })
    .catch(() => {});
});

// 4. Graceful Shutdown Management
let isShuttingDown = false;

async function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[SHUTDOWN] Received ${signal}. Starting graceful shutdown...`);

  // Close HTTP server to stop accepting new requests
  server.close(async () => {
    logger.info("HTTP server closed.");

    // Close database connection pool
    await closeDatabaseConnection();

    logger.info("[SHUTDOWN] Graceful shutdown complete. Exiting process.");
    process.exit(0);
  });

  // Force close if graceful shutdown hangs
  setTimeout(() => {
    logger.error("[TIMEOUT] Forcefully terminating process due to shutdown timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));
process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
