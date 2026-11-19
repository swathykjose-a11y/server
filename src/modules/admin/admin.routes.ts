import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { adminService } from "./admin.service.js";
import { cmsService } from "../cms/cms.service.js";
import { updateOrderStatusSchema, upsertProductSchema } from "./admin.schema.js";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { adminsTable } from "../../db/schema/index.js";
import { verifyPassword, generateAdminToken, verifyAdminToken, type AdminTokenPayload } from "../../lib/auth.js";

export const adminRouter = new Hono<{
  Variables: {
    adminUser?: AdminTokenPayload;
  };
}>();

// POST /api/admin/login (Public login for admin users)
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

adminRouter.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const normalizedEmail = email.toLowerCase().trim();

  const [admin] = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.email, normalizedEmail))
    .limit(1);

  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return c.json(
      {
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
      },
      401,
    );
  }

  const token = generateAdminToken({
    id: admin.id,
    email: admin.email,
    role: admin.role,
  });

  return c.json({
    success: true,
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });
});

// Admin Authentication Middleware (applies to all routes defined below)
adminRouter.use("*", async (c, next) => {
  const adminKey =
    c.req.header("X-Admin-Key") ||
    c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");

  if (adminKey && adminKey === env.ADMIN_API_KEY) {
    return await next();
  }

  if (adminKey) {
    const verified = verifyAdminToken(adminKey);
    if (verified) {
      c.set("adminUser", verified);
      return await next();
    }
  }

  return c.json(
    {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Invalid or missing admin credentials" },
    },
    401,
  );
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
