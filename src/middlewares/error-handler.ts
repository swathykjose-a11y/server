import type { Context } from "hono";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";
import { emailService } from "../lib/resend.js";

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(err: Error, c: Context) {
  const requestId = c.get("requestId") as string | undefined;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formatted = err.flatten();
    logger.warn(`Validation Error on ${c.req.method} ${c.req.path}`, formatted, requestId);
    return c.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: formatted,
        },
      },
      400,
    );
  }

  // Handle custom application errors
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message} (${err.code})`, { code: err.code, details: err.details }, requestId);
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      },
      err.statusCode as any,
    );
  }

  // Handle unhandled exceptions & report to Sentry
  logger.error(`Unhandled Exception on ${c.req.method} ${c.req.path}`, err, { path: c.req.path }, requestId);

  // Dispatch real-time error alert email to developer (bhavartheankit@gmail.com)
  emailService
    .sendServerErrorAlert({
      error: err,
      path: c.req.path,
      method: c.req.method,
      requestId,
      context: "HTTP Route Handler Error",
    })
    .catch((e) => logger.warn("Failed to dispatch error alert email", e));

  return c.json(
    {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred. Our team has been notified.",
      },
    },
    500,
  );
}
