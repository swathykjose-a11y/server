import crypto from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  ordersTable,
  productsTable,
  productVariantsTable,
  collectionProductsTable,
  paymentTransactionsTable,
  pollingAuditLogsTable,
} from "../../db/schema/index.js";
import { z } from "zod";
import { updateOrderStatusSchema, upsertProductSchema, verifyPaymentSchema } from "./admin.schema.js";
import { productsService } from "../products/products.service.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../middlewares/error-handler.js";
import { STORE_UPI, buildUpiUri } from "../../config/store-payment.js";
import { triggerStorefrontRevalidation } from "../../lib/revalidate.js";

export class AdminService {
  async listOrders(params?: { status?: string; limit?: number; offset?: number }) {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;

    let query = db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(limit).offset(offset);

    if (params?.status) {
      query = db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.status, params.status))
        .orderBy(desc(ordersTable.createdAt))
        .limit(limit)
        .offset(offset) as any;
    }

    const rows = await query;
    return rows;
  }

  async updateOrderDropshipDetails(orderId: string, input: z.infer<typeof updateOrderStatusSchema>) {
    const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

    if (!existing) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    const [updated] = await db
      .update(ordersTable)
      .set({
        status: input.status || existing.status,
        paymentStatus: input.paymentStatus || existing.paymentStatus,
        paymentMethod: input.paymentMethod || existing.paymentMethod,
        supplierOrderId: input.supplierOrderId !== undefined ? input.supplierOrderId : existing.supplierOrderId,
        supplierOrderUrl: input.supplierOrderUrl !== undefined ? input.supplierOrderUrl : existing.supplierOrderUrl,
        supplierCost: input.supplierCost !== undefined ? input.supplierCost.toFixed(2) : existing.supplierCost,
        supplierNotes: input.supplierNotes !== undefined ? input.supplierNotes : existing.supplierNotes,
        courierTrackingNumber: input.courierTrackingNumber !== undefined ? input.courierTrackingNumber : existing.courierTrackingNumber,
        courierTrackingUrl: input.courierTrackingUrl !== undefined ? input.courierTrackingUrl : existing.courierTrackingUrl,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, orderId))
      .returning();

    logger.info(`Admin updated order #${updated.orderNumber} status to [${updated.status}], payment [${updated.paymentStatus}]`);
    return updated;
  }

  async verifyOrderPayment(orderId: string, input: z.infer<typeof verifyPaymentSchema>) {
    const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

    if (!existing) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    const newPaymentStatus = input.paymentStatus;
    // Auto-confirm order if marking as paid and status was pending
    let newStatus = existing.status;
    if (newPaymentStatus === "paid" && input.autoConfirmOrder && existing.status === "pending") {
      newStatus = "confirmed";
    }

    const verificationNote = input.utr
      ? `[UPI Verified - UTR: ${input.utr.trim()}] ${input.notes || ""}`.trim()
      : input.notes
        ? `[Payment Verified] ${input.notes.trim()}`
        : existing.notes;

    const [updated] = await db
      .update(ordersTable)
      .set({
        paymentStatus: newPaymentStatus,
        status: newStatus,
        notes: verificationNote,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, orderId))
      .returning();

    logger.info(`Admin verified payment for order #${updated.orderNumber}: paymentStatus=[${newPaymentStatus}], status=[${newStatus}]`);
    return updated;
  }

  async getPaymentReceivingOverview() {
    const allOrders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));

    let totalPaidInr = 0;
    let pendingVerificationInr = 0;
    let pendingVerificationCount = 0;
    const paymentMethodCounts = { upi: 0, phonepe: 0, cod: 0, online: 0 };
    const paymentStatusCounts = { pending: 0, paid: 0, failed: 0, refunded: 0 };

    for (const order of allOrders) {
      const orderTotal = Number(order.total) || 0;
      const method = (order.paymentMethod || "upi").toLowerCase() as keyof typeof paymentMethodCounts;
      const pStatus = (order.paymentStatus || "pending").toLowerCase() as keyof typeof paymentStatusCounts;

      if (paymentMethodCounts[method] !== undefined) {
        paymentMethodCounts[method]++;
      }
      if (paymentStatusCounts[pStatus] !== undefined) {
        paymentStatusCounts[pStatus]++;
      }

      if (pStatus === "paid") {
        totalPaidInr += orderTotal;
      } else if (pStatus === "pending") {
        pendingVerificationInr += orderTotal;
        pendingVerificationCount++;
      }
    }

    // Recent payment transactions (e.g. PhonePe or gateway)
    const recentTransactions = await db
      .select()
      .from(paymentTransactionsTable)
      .orderBy(desc(paymentTransactionsTable.createdAt))
      .limit(20);

    // Recent polling audit logs
    const recentAuditLogs = await db
      .select()
      .from(pollingAuditLogsTable)
      .orderBy(desc(pollingAuditLogsTable.createdAt))
      .limit(10);

    return {
      storeUpi: {
        payeeName: STORE_UPI.payeeName,
        vpa: STORE_UPI.vpa,
        phone: STORE_UPI.phone,
        sampleUri: buildUpiUri(1299, "Dainty Dazzle Preview"),
      },
      stats: {
        totalPaidInr: Math.round(totalPaidInr * 100) / 100,
        pendingVerificationInr: Math.round(pendingVerificationInr * 100) / 100,
        pendingVerificationCount,
        paymentMethodCounts,
        paymentStatusCounts,
        totalTransactionsRecorded: recentTransactions.length,
      },
      recentTransactions,
      recentAuditLogs,
    };
  }

  async upsertProduct(input: z.infer<typeof upsertProductSchema>) {
    const productId = input.id || `prod_${crypto.randomUUID()}`;

    const productValues = {
      id: productId,
      handle: input.handle.toLowerCase(),
      title: input.title,
      descriptionHtml: input.descriptionHtml,
      availableForSale: input.availableForSale,
      totalInventory: input.totalInventory,
      minPrice: input.minPrice.toFixed(2),
      compareAtPrice: input.compareAtPrice ? input.compareAtPrice.toFixed(2) : null,
      currency: "INR",
      tags: input.tags,
      images: input.images as any,
      isActive: true,
      updatedAt: new Date(),
    };

    await db
      .insert(productsTable)
      .values(productValues)
      .onConflictDoUpdate({
        target: productsTable.id,
        set: productValues,
      });

    // Clear existing variants if updating
    await db.delete(productVariantsTable).where(eq(productVariantsTable.productId, productId));

    for (const v of input.variants) {
      await db.insert(productVariantsTable).values({
        id: v.id || `var_${crypto.randomUUID()}`,
        productId,
        title: v.title,
        availableForSale: v.availableForSale,
        quantityAvailable: v.quantityAvailable,
        price: v.price.toFixed(2),
        compareAtPrice: v.compareAtPrice ? v.compareAtPrice.toFixed(2) : null,
        currency: "INR",
      });
    }

    if (input.collectionIds && input.collectionIds.length > 0) {
      await db.delete(collectionProductsTable).where(eq(collectionProductsTable.productId, productId));
      for (const colId of input.collectionIds) {
        await db
          .insert(collectionProductsTable)
          .values({ collectionId: colId, productId, sortOrder: 0 })
          .onConflictDoNothing();
      }
    }

    // Invalidate Redis product cache
    await productsService.invalidateCache(input.handle);

    // Trigger instant storefront revalidation webhook
    triggerStorefrontRevalidation([
      "/",
      "/products",
      "/collections/earrings",
      "/collections/necklaces",
      "/collections/new-arrivals",
      `/products/${input.handle}`,
    ]).catch((err) => logger.warn("[REVALIDATE] async failure", err));

    return productsService.getProductByHandle(input.handle);
  }

  async deleteProduct(productId: string) {
    const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);

    if (!existing) {
      throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    }

    // Soft delete product by marking isActive false
    await db.update(productsTable).set({ isActive: false, updatedAt: new Date() }).where(eq(productsTable.id, productId));

    await productsService.invalidateCache(existing.handle);

    // Trigger instant storefront revalidation webhook
    triggerStorefrontRevalidation([
      "/",
      "/products",
      "/collections/earrings",
      "/collections/necklaces",
      "/collections/new-arrivals",
      `/products/${existing.handle}`,
    ]).catch((err) => logger.warn("[REVALIDATE] async failure", err));

    logger.info(`Product ${existing.handle} marked inactive`);
    return { success: true, message: "Product deactivated successfully" };
  }
}

export const adminService = new AdminService();
