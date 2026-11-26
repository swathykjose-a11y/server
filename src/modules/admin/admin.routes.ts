import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { adminService } from "./admin.service.js";
import { cmsService } from "../cms/cms.service.js";
import { paymentsService } from "../payments/payments.service.js";
import { updateOrderStatusSchema, upsertProductSchema, verifyPaymentSchema } from "./admin.schema.js";
import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { adminsTable } from "../../db/schema/index.js";
import { verifyPassword, generateAdminToken, verifyAdminToken, safeEqual, type AdminTokenPayload } from "../../lib/auth.js";
import { clientAddress, rateLimitMiddleware } from "../../middlewares/rate-limit.js";
import { cloudinaryService } from "../../lib/cloudinary.js";

export const adminRouter = new Hono<{
  Variables: {
    adminUser?: AdminTokenPayload;
  };
}>();

// POST /api/admin/login (Public login for admin users)
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

adminRouter.post(
  "/login",
  rateLimitMiddleware({
    limit: 8,
    windowSeconds: 15 * 60,
    failClosed: true,
    keyGenerator: (c) => `admin-login:${clientAddress(c)}`,
  }),
  zValidator("json", loginSchema),
  async (c) => {
  const { email, password } = c.req.valid("json");
  const normalizedEmail = email.toLowerCase().trim();

  const [admin] = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.email, normalizedEmail))
    .limit(1);

  const passwordOk = admin
    ? verifyPassword(password, admin.passwordHash)
    : verifyPassword(password, `${"00".repeat(16)}:${"00".repeat(64)}`);

  if (!admin || !passwordOk) {
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

  if (adminKey && safeEqual(adminKey, env.ADMIN_API_KEY)) {
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
  const requestedLimit = Number(c.req.query("limit"));
  const requestedOffset = Number(c.req.query("offset"));
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
  const offset = Number.isFinite(requestedOffset) ? Math.min(10_000, Math.max(0, requestedOffset)) : 0;

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

// POST /api/admin/upload (Upload image to Cloudinary)
const uploadImageSchema = z.object({
  file: z
    .string()
    .min(1)
    .max(8_000_000)
    .refine((value) => value.startsWith("data:image/"), "Upload must be an image data URL"),
  folder: z.string().regex(/^[a-z0-9/_-]{1,80}$/i).optional().default("dainty-dazzle"),
});

adminRouter.post("/upload", zValidator("json", uploadImageSchema), async (c) => {
  const { file, folder } = c.req.valid("json");
  const uploadResult = await cloudinaryService.uploadImage(file, folder);

  if (!uploadResult) {
    return c.json(
      { success: false, error: { code: "UPLOAD_FAILED", message: "Failed to upload image to Cloudinary" } },
      500,
    );
  }

  return c.json({ success: true, image: uploadResult });
});

// GET /api/admin/payments/overview (Store UPI receiving info, transactions, and audit stats)
adminRouter.get("/payments/overview", async (c) => {
  const overview = await adminService.getPaymentReceivingOverview();
  return c.json({ success: true, ...overview });
});

// POST /api/admin/orders/:id/verify-payment (Verify incoming UPI or gateway payment for order)
adminRouter.post("/orders/:id/verify-payment", zValidator("json", verifyPaymentSchema), async (c) => {
  const id = c.req.param("id");
  const input = c.req.valid("json");
  const updated = await adminService.verifyOrderPayment(id, input);
  return c.json({ success: true, order: updated });
});

// POST /api/admin/payments/reconcile/:transactionId (Trigger PhonePe status check & reconcile)
adminRouter.post("/payments/reconcile/:transactionId", async (c) => {
  const transactionId = c.req.param("transactionId");
  const result = await paymentsService.checkStatusAndReconcile(transactionId);
  return c.json(result);
});
