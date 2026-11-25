import { Hono } from "hono";
import { paymentsService } from "./payments.service.js";
import { env } from "../../config/env.js";
import { safeEqual, verifyAdminToken } from "../../lib/auth.js";

export const paymentsRouter = new Hono();

function isAdminRequest(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const adminKey = c.req.header("X-Admin-Key") || c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!adminKey) return false;
  if (safeEqual(adminKey, env.ADMIN_API_KEY)) return true;
  return verifyAdminToken(adminKey) !== null;
}

// Storefront checkout is personal UPI only. PhonePe initiation is not a public checkout path.
paymentsRouter.post("/initiate", async (c) => {
  return c.json(
    {
      success: false,
      error: {
        code: "UPI_ONLY",
        message: "This store accepts UPI only. Cash on delivery and the payment gateway are not available.",
      },
    },
    410,
  );
});

// POST /api/payments/phonepe-webhook (PhonePe server-to-server callback)
paymentsRouter.post("/phonepe-webhook", async (c) => {
  const xVerify = c.req.header("X-VERIFY") || "";
  let base64Response = "";

  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await c.req.json();
    base64Response = json.response || "";
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await c.req.parseBody();
    base64Response = (form.response as string) || "";
  } else {
    base64Response = await c.req.text();
  }

  if (base64Response.length > 20_000) {
    return c.json(
      { success: false, error: { code: "PAYLOAD_TOO_LARGE", message: "Webhook payload is too large" } },
      413,
    );
  }

  const result = await paymentsService.handlePhonePeWebhook(base64Response, xVerify);
  return c.json(result);
});

// GET /api/payments/status/:transactionId (admin reconcile only)
paymentsRouter.get("/status/:transactionId", async (c) => {
  if (!isAdminRequest(c)) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing admin credentials" } },
      401,
    );
  }
  const transactionId = c.req.param("transactionId");
  const result = await paymentsService.checkStatusAndReconcile(transactionId);
  return c.json(result);
});
