import crypto from "crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { ordersTable, orderItemsTable, productsTable, productVariantsTable } from "../../db/schema/index.js";
import { CreateOrderInput } from "./orders.schema.js";
import { emailService } from "../../lib/resend.js";
import { sendFreeAdminPhoneAlert } from "../../lib/notify.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../middlewares/error-handler.js";
import { orderViewToken } from "../../lib/auth.js";
import { FREE_SHIPPING_MIN_INR, SHIPPING_FEE_INR, STORE_UPI, buildUpiUri } from "../../config/store-payment.js";

export class OrdersService {
  /**
   * Generates sequential customer-facing order number starting from DD_001.
   * Prefix is always "DD_00" (e.g. DD_001, DD_002, DD_0010, ...).
   */
  private async generateOrderNumber(): Promise<string> {
    try {
      const allOrders = await db
        .select({ orderNumber: ordersTable.orderNumber })
        .from(ordersTable);

      let maxSeq = 0;
      const existingNumbers = new Set<string>();

      for (const o of allOrders) {
        if (!o.orderNumber) continue;
        existingNumbers.add(o.orderNumber);

        // Matches DD_001, DD_002, DD_0010, etc.
        const match = o.orderNumber.match(/^DD_00(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }

      let nextSeq = maxSeq + 1;
      let candidate = `DD_00${nextSeq}`;

      // Collision avoidance in case of gaps or manual entries
      while (existingNumbers.has(candidate)) {
        nextSeq++;
        candidate = `DD_00${nextSeq}`;
      }

      return candidate;
    } catch (err) {
      logger.error("Failed to calculate sequential order number, fallback to DD_001", err);
      return `DD_001`;
    }
  }

  async createOrder(input: CreateOrderInput, idempotencyKey?: string) {
    if (input.paymentMethod !== "upi") {
      throw new AppError("Cash on delivery is not available. Pay by UPI.", 400, "COD_NOT_AVAILABLE");
    }

    const orderId = `ord_${crypto.randomUUID()}`;
    const orderNumber = await this.generateOrderNumber();

    // Check if idempotencyKey was already committed in DB
    if (idempotencyKey) {
      const [existing] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.idempotencyKey, idempotencyKey))
        .limit(1);

      if (existing) {
        logger.info(`Existing order found for idempotency key ${idempotencyKey}: ${existing.orderNumber}`);
        const existingOrder = await this.getOrderById(existing.id);
        return this.checkoutResult(existingOrder);
      }
    }

    const priced = await this.priceFromCatalog(input.items);

    const [createdOrder] = await db
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
        subtotal: priced.subtotal.toFixed(2),
        shippingFee: priced.shippingFee.toFixed(2),
        total: priced.total.toFixed(2),
        currency: "INR",
        paymentMethod: "upi",
        paymentStatus: "pending",
        status: "pending",
        idempotencyKey,
        notes: input.notes
          ? `UTR: ${input.transactionId} | ${input.notes}`
          : `UTR: ${input.transactionId}`,
      })
      .returning();

    for (const item of priced.lines) {
      await db.insert(orderItemsTable).values({
        id: `item_${crypto.randomUUID()}`,
        orderId: createdOrder.id,
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

    logger.info(`Order #${orderNumber} created for UPI payment of ₹${priced.total.toFixed(0)}`);

    this.dispatchOrderEmails(createdOrder.id).catch((err) => {
      logger.error(`Failed to dispatch emails for order #${orderNumber}`, err);
    });

    const itemsSummary = priced.lines
      .map((l) => `${l.productTitle} x${l.quantity}`)
      .join(", ");
    sendFreeAdminPhoneAlert({
      orderNumber,
      totalInr: priced.total,
      customerName: `${input.customer.firstName} ${input.customer.lastName}`.trim(),
      customerPhone: input.customer.phone,
      itemsSummary,
      transactionId: input.transactionId,
    }).catch((err) => {
      logger.error(`Failed to send phone alert for order #${orderNumber}`, err);
    });

    const order = await this.getOrderById(createdOrder.id);
    return this.checkoutResult(order);
  }

  private async priceFromCatalog(items: CreateOrderInput["items"]) {
    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(item.variantId, (quantities.get(item.variantId) || 0) + item.quantity);
    }

    const variantIds = [...quantities.keys()];
    const rows = await db
      .select({
        variant: productVariantsTable,
        product: productsTable,
      })
      .from(productVariantsTable)
      .innerJoin(productsTable, eq(productVariantsTable.productId, productsTable.id))
      .where(inArray(productVariantsTable.id, variantIds));

    if (rows.length !== variantIds.length) {
      throw new AppError("One or more products are no longer available", 400, "PRODUCT_UNAVAILABLE");
    }

    const lines = rows.map((row) => {
      const quantity = quantities.get(row.variant.id) || 0;
      if (!row.product.isActive || !row.product.availableForSale || !row.variant.availableForSale) {
        throw new AppError(`${row.product.title} is not available`, 400, "PRODUCT_UNAVAILABLE");
      }
      if (row.variant.quantityAvailable != null && row.variant.quantityAvailable < quantity) {
        throw new AppError(`Not enough stock for ${row.product.title}`, 400, "INSUFFICIENT_STOCK");
      }
      const price = Number(row.variant.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new AppError(`${row.product.title} has no price`, 400, "PRODUCT_UNAVAILABLE");
      }
      const imageUrl = row.product.images?.[0]?.url;
      return {
        productId: row.product.id,
        productTitle: row.product.title,
        productHandle: row.product.handle,
        variantId: row.variant.id,
        variantTitle: row.variant.title,
        price,
        quantity,
        imageUrl,
      };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const shippingFee = subtotal >= FREE_SHIPPING_MIN_INR ? 0 : SHIPPING_FEE_INR;
    return { lines, subtotal, shippingFee, total: subtotal + shippingFee };
  }

  private checkoutResult(order: Awaited<ReturnType<OrdersService["getOrderById"]>>) {
    const note = `Dainty Dazzle ${order.orderNumber}`;
    return {
      order: this.toCustomerOrder(order),
      viewToken: orderViewToken(order.id),
      payment: {
        payeeName: STORE_UPI.payeeName,
        vpa: STORE_UPI.vpa,
        phone: STORE_UPI.phone,
        amount: order.total,
        currency: "INR",
        note,
        upiUri: buildUpiUri(order.total, note),
      },
    };
  }

  toCustomerOrder(order: Awaited<ReturnType<OrdersService["getOrderById"]>>) {
    const { supplierTracking: _supplierTracking, ...customerOrder } = order;
    return customerOrder;
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
