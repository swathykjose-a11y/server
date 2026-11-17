import { captureException, captureMessage } from "../config/sentry.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

class Logger {
  private formatLog(level: LogLevel, message: string, metadata?: Record<string, unknown>, requestId?: string): LogPayload {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      requestId,
      metadata,
    };
  }

  debug(message: string, metadata?: Record<string, unknown>, requestId?: string): void {
    if (process.env.NODE_ENV === "development") {
      console.debug(JSON.stringify(this.formatLog("debug", message, metadata, requestId)));
    }
  }

  info(message: string, metadata?: Record<string, unknown>, requestId?: string): void {
    console.log(JSON.stringify(this.formatLog("info", message, metadata, requestId)));
  }

  warn(message: string, metadata?: Record<string, unknown>, requestId?: string): void {
    console.warn(JSON.stringify(this.formatLog("warn", message, metadata, requestId)));
    captureMessage(message, "warning", { ...metadata, requestId });
  }

  error(message: string, error?: unknown, metadata?: Record<string, unknown>, requestId?: string): void {
    const errorDetails = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
    const combinedMeta = { ...metadata, error: errorDetails, requestId };
    console.error(JSON.stringify(this.formatLog("error", message, combinedMeta, requestId)));
    captureException(error || new Error(message), combinedMeta);
  }
}

export const logger = new Logger();
