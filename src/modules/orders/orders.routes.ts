import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ordersService } from "./orders.service.js";
import { createOrderSchema } from "./orders.schema.js";
import { idempotencyMiddleware } from "../../middlewares/idempotency.js";

export const ordersRouter = new Hono();

// POST /api/orders (Create dropshipping order with idempotency protection)
ordersRouter.post(
  "/",
  idempotencyMiddleware(),
  zValidator("json", createOrderSchema),
  async (c) => {
    const input = c.req.valid("json");
    const idempotencyKey = c.req.header("Idempotency-Key");

    const order = await ordersService.createOrder(input, idempotencyKey);

    return c.json(
      {
        success: true,
        order,
        message: "Order placed successfully",
      },
      201,
    );
  },
);

// GET /api/orders/:id (Retrieve order by ID)
ordersRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const order = await ordersService.getOrderById(id);
  return c.json(order);
});
