import crypto from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  ordersTable,
  productsTable,
  productVariantsTable,
  collectionProductsTable,
} from "../../db/schema/index.js";
import { z } from "zod";
import { updateOrderStatusSchema, upsertProductSchema } from "./admin.schema.js";
import { productsService } from "../products/products.service.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../middlewares/error-handler.js";

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
        supplierOrderId: input.supplierOrderId !== undefined ? input.supplierOrderId : existing.supplierOrderId,
        supplierOrderUrl: input.supplierOrderUrl !== undefined ? input.supplierOrderUrl : existing.supplierOrderUrl,
        supplierCost: input.supplierCost !== undefined ? input.supplierCost.toFixed(2) : existing.supplierCost,
        supplierNotes: input.supplierNotes !== undefined ? input.supplierNotes : existing.supplierNotes,
        courierTrackingNumber: input.courierTrackingNumber !== undefined ? input.courierTrackingNumber : existing.courierTrackingNumber,
        courierTrackingUrl: input.courierTrackingUrl !== undefined ? input.courierTrackingUrl : existing.courierTrackingUrl,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, orderId))
      .returning();

    logger.info(`Admin updated order #${updated.orderNumber} status to [${updated.status}]`);
    return updated;
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

    await db.transaction(async (tx) => {
      await tx
        .insert(productsTable)
        .values(productValues)
        .onConflictDoUpdate({
          target: productsTable.id,
          set: productValues,
        });

      // Clear existing variants if updating
      await tx.delete(productVariantsTable).where(eq(productVariantsTable.productId, productId));

      for (const v of input.variants) {
        await tx.insert(productVariantsTable).values({
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
        await tx.delete(collectionProductsTable).where(eq(collectionProductsTable.productId, productId));
        for (const colId of input.collectionIds) {
          await tx
            .insert(collectionProductsTable)
            .values({ collectionId: colId, productId, sortOrder: 0 })
            .onConflictDoNothing();
        }
      }
    });

    // Invalidate Redis product cache
    await productsService.invalidateCache(input.handle);

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
    logger.info(`Product ${existing.handle} marked inactive`);
    return { success: true, message: "Product deactivated successfully" };
  }
}

export const adminService = new AdminService();
