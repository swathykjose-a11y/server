import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ordersService } from "./orders.service.js";
import { createOrderSchema } from "./orders.schema.js";
import { idempotencyMiddleware } from "../../middlewares/idempotency.js";
import { orderViewTokenMatches } from "../../lib/auth.js";

export const ordersRouter = new Hono();

// POST /api/orders (Create dropshipping order with idempotency protection)
ordersRouter.post(
  "/",
  idempotencyMiddleware(),
  zValidator("json", createOrderSchema),
  async (c) => {
    const input = c.req.valid("json");
    const idempotencyKey = c.req.header("Idempotency-Key");

    const result = await ordersService.createOrder(input, idempotencyKey);

    return c.json(
      {
        success: true,
        ...result,
        message: "Pay the UPI request to confirm this order. Cash on delivery is not available.",
      },
      201,
    );
  },
);

// GET /api/orders/:id?token=... (customer receipt; token is returned at checkout)
ordersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const token = c.req.query("token") || "";
  if (!orderViewTokenMatches(id, token)) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "Order not found" } },
      404,
    );
  }
  const order = ordersService.toCustomerOrder(await ordersService.getOrderById(id));
  return c.json({ success: true, order });
});
