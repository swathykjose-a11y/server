import { createApp } from "./app.js";
import { initSentry } from "./config/sentry.js";

// Initialize Sentry monitoring
initSentry();

// Initialize Hono application
const app = createApp();

export default {
  fetch: app.fetch,
};
