import { createApp } from "./app.js";
import { initSentry } from "./config/sentry.js";

let app: ReturnType<typeof createApp> | null = null;

export default {
  async fetch(request: Request, envBindings: Record<string, string>, ctx?: any) {
    if (envBindings) {
      Object.assign(process.env, envBindings);
    }
    if (!app) {
      initSentry();
      app = createApp();
    }
    return app.fetch(request, envBindings, ctx);
  },
};
