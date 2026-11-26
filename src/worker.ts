import { createApp } from "./app.js";
import { initSentry } from "./config/sentry.js";
import { reloadEnv } from "./config/env.js";

let app: ReturnType<typeof createApp> | null = null;

export default {
  async fetch(request: Request, envBindings: Record<string, string>, ctx?: any) {
    try {
      if (envBindings) {
        Object.assign(process.env, envBindings);
        reloadEnv();
      }
      if (!app) {
        try {
          initSentry();
        } catch (sentryErr) {
          console.warn("Sentry init skipped in worker environment", sentryErr);
        }
        app = createApp();
      }
      return await app.fetch(request, envBindings, ctx);
    } catch (err: any) {
      console.error("[FATAL WORKER ERROR]", err);
      return new Response(
        JSON.stringify({
          error: "Worker Exception",
          message: err?.message || String(err),
          stack: err?.stack,
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }
  },
};
