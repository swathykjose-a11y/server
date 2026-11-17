import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { ordersTable, orderItemsTable } from "../../db/schema/index.js";
import { CreateOrderInput } from "./orders.schema.js";
import { emailService } from "../../lib/resend.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../middlewares/error-handler.js";

export class OrdersService {
  /**
   * Generates a clean customer-facing order number: DD-<timestamp-slice>-<random>
   */
  private generateOrderNumber(): string {
    const timestamp = Date.now().toString().slice(-5);
    const random = Math.floor(1000 + Math.random() * 9000);
    return `DD-${timestamp}-${random}`;
  }

  async createOrder(input: CreateOrderInput, idempotencyKey?: string) {
    const orderId = `ord_${crypto.randomUUID()}`;
    const orderNumber = this.generateOrderNumber();

    // Check if idempotencyKey was already committed in DB
    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) {
        logger.info(`Existing order found for idempotency key ${idempotencyKey}: ${existing.orderNumber}`);
        return this.getOrderById(existing.id);
      }
    }

    const isCod = input.paymentMethod === "cod";
    const initialStatus = isCod ? "confirmed" : "pending";
    const initialPaymentStatus = isCod ? "pending" : "pending";

    // Insert order in transaction
    const [createdOrder] = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(ordersTable)
        .values({
          id: orderId,
          orderNumber,
          customerFirstName: input.customer.firstName,
          customerLastName: input.customer.lastName,
          customerEmail: input.customer.email.toLowerCase(),
          customerPhone: input.customer.phone,
          addressLine1: input.customer.addressLine1,
          addressLine2: input.customer.addressLine2,
          city: input.customer.city,
          state: input.customer.state,
          postalCode: input.customer.postalCode,
          country: input.customer.country,
          subtotal: input.subtotal.toFixed(2),
          shippingFee: input.shippingFee.toFixed(2),
          total: input.total.toFixed(2),
          currency: "INR",
          paymentMethod: input.paymentMethod,
          paymentStatus: initialPaymentStatus,
          status: initialStatus,
          idempotencyKey,
          notes: input.notes,
        })
        .returning();

      for (const item of input.items) {
        await tx.insert(orderItemsTable).values({
          id: `item_${crypto.randomUUID()}`,
          orderId: order.id,
          productId: item.productId,
          productTitle: item.productTitle,
          productHandle: item.productHandle,
          variantId: item.variantId,
          variantTitle: item.variantTitle,
          price: item.price.toFixed(2),
          quantity: item.quantity,
          imageUrl: item.imageUrl,
        });
      }

      return [order];
    });

    logger.info(`Order #${orderNumber} created successfully (${input.paymentMethod})`);

    // If COD, dispatch emails immediately
    if (isCod) {
      this.dispatchOrderEmails(createdOrder.id).catch((err) => {
        logger.error(`Failed to dispatch emails for order #${orderNumber}`, err);
      });
    }

    return this.getOrderById(createdOrder.id);
  }

  async getOrderById(orderId: string) {
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!order) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    const items = await db
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, order.id));

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customer: {
        firstName: order.customerFirstName,
        lastName: order.customerLastName,
        email: order.customerEmail,
        phone: order.customerPhone,
        addressLine1: order.addressLine1,
        addressLine2: order.addressLine2,
        city: order.city,
        state: order.state,
        postalCode: order.postalCode,
        country: order.country,
      },
      items: items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productTitle: i.productTitle,
        productHandle: i.productHandle,
        variantId: i.variantId,
        variantTitle: i.variantTitle,
        price: parseFloat(i.price),
        quantity: i.quantity,
        imageUrl: i.imageUrl,
      })),
      subtotal: parseFloat(order.subtotal),
      shippingFee: parseFloat(order.shippingFee),
      total: parseFloat(order.total),
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      status: order.status,
      supplierTracking: {
        supplierOrderId: order.supplierOrderId,
        supplierOrderUrl: order.supplierOrderUrl,
        supplierCost: order.supplierCost ? parseFloat(order.supplierCost) : null,
        courierTrackingNumber: order.courierTrackingNumber,
        courierTrackingUrl: order.courierTrackingUrl,
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async markOrderAsPaid(orderId: string): Promise<void> {
    const [updated] = await db
      .update(ordersTable)
      .set({
        paymentStatus: "paid",
        status: "confirmed",
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, orderId))
      .returning();

    if (updated) {
      logger.info(`Order #${updated.orderNumber} marked as PAID & CONFIRMED`);
      // Dispatch emails to customer and admin
      await this.dispatchOrderEmails(orderId);
    }
  }

  async dispatchOrderEmails(orderId: string): Promise<void> {
    const order = await this.getOrderById(orderId);

    const emailPayload = {
      orderNumber: order.orderNumber,
      customerName: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      customerEmail: order.customer.email,
      customerPhone: order.customer.phone,
      shippingAddress: {
        addressLine1: order.customer.addressLine1,
        addressLine2: order.customer.addressLine2 || undefined,
        city: order.customer.city,
        state: order.customer.state,
        postalCode: order.customer.postalCode,
        country: order.customer.country,
      },
      items: order.items.map((i) => ({
        title: i.productTitle,
        variantTitle: i.variantTitle,
        quantity: i.quantity,
        price: i.price,
        imageUrl: i.imageUrl || undefined,
      })),
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    };

    // 1. Send confirmation email to customer
    await emailService.sendOrderConfirmationToCustomer(emailPayload);

    // 2. Send dropshipping alert email to admin on swathykjose@gmail.com
    await emailService.sendNewOrderAlertToAdmin(emailPayload);
  }
}

export const ordersService = new OrdersService();
