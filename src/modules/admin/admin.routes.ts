import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { adminService } from "./admin.service.js";
import { cmsService } from "../cms/cms.service.js";
import { updateOrderStatusSchema, upsertProductSchema } from "./admin.schema.js";
import { env } from "../../config/env.js";

export const adminRouter = new Hono();

// Admin Authentication Middleware
adminRouter.use("*", async (c, next) => {
  const adminKey = c.req.header("X-Admin-Key") || c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");

  if (!adminKey || adminKey !== env.ADMIN_API_KEY) {
    return c.json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing admin credentials" } }, 401);
  }

  return await next();
});

// GET /api/admin/orders (List all orders with dropship details)
adminRouter.get("/orders", async (c) => {
  const status = c.req.query("status");
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 50;
  const offset = c.req.query("offset") ? Number(c.req.query("offset")) : 0;

  const orders = await adminService.listOrders({ status, limit, offset });
  return c.json({ orders });
});

// PATCH /api/admin/orders/:id (Update dropshipping fulfillment status and supplier info)
adminRouter.patch("/orders/:id", zValidator("json", updateOrderStatusSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const updated = await adminService.updateOrderDropshipDetails(id, input);
  return c.json({ success: true, order: updated });
});

// POST /api/admin/products (Create or update product)
adminRouter.post("/products", zValidator("json", upsertProductSchema), async (c) => {
  const input = c.req.valid("json");
  const product = await adminService.upsertProduct(input);
  return c.json({ success: true, product });
});

// DELETE /api/admin/products/:id (Deactivate product)
adminRouter.delete("/products/:id", async (c) => {
  const id = c.req.param("id");
  const result = await adminService.deleteProduct(id);
  return c.json(result);
});

// POST /api/admin/cms/:section (Update homepage CMS section content)
adminRouter.post("/cms/:section", async (c) => {
  const section = c.req.param("section");
  const body = await c.req.json();
  await cmsService.updateSectionData(section, body);
  return c.json({ success: true, message: `CMS section ${section} updated successfully` });
});
