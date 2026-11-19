import * as Sentry from "@sentry/node";
import { env } from "./env.js";

export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    console.log("[INFO] Sentry DSN not configured. Sentry tracking is disabled.");
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.2 : 1.0,
    debug: env.NODE_ENV === "development",
  });

  console.log("[SENTRY] Sentry initialized successfully.");
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  console.error("[ERROR] Error captured:", error, context);
  if (env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }
      Sentry.captureException(error);
    });
  }
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info", context?: Record<string, unknown>): void {
  console.log(`[${level.toUpperCase()}] ${message}`, context || "");
  if (env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }
      Sentry.captureMessage(message, level);
    });
  }
}
