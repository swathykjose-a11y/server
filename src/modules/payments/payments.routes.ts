import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { paymentsService } from "./payments.service.js";
import { initiatePaymentSchema } from "./payments.schema.js";
import { idempotencyMiddleware } from "../../middlewares/idempotency.js";

export const paymentsRouter = new Hono();

// POST /api/payments/initiate (Initiate PhonePe payment with idempotency)
paymentsRouter.post(
  "/initiate",
  idempotencyMiddleware(),
  zValidator("json", initiatePaymentSchema),
  async (c) => {
    const { orderId } = c.req.valid("json");
    const result = await paymentsService.initiatePhonePePayment(orderId);
    return c.json(result);
  },
);

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

  const result = await paymentsService.handlePhonePeWebhook(base64Response, xVerify);
  return c.json(result);
});

// GET /api/payments/status/:transactionId (Reconcile status directly from PhonePe)
paymentsRouter.get("/status/:transactionId", async (c) => {
  const transactionId = c.req.param("transactionId");
  const result = await paymentsService.checkStatusAndReconcile(transactionId);
  return c.json(result);
});
