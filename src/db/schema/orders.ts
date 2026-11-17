import { pgTable, text, numeric, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const ordersTable = pgTable(
  "orders",
  {
    id: text("id").primaryKey(), // uuid
    orderNumber: text("order_number").notNull(), // e.g. DD-84729-1029

    // Customer Contact
    customerFirstName: text("customer_first_name").notNull(),
    customerLastName: text("customer_last_name").default(""),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),

    // Shipping Address
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("India"),

    // Financials
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("INR"),

    // Payment State
    paymentMethod: text("payment_method").notNull().default("cod"), // 'cod' | 'phonepe' | 'online'
    paymentStatus: text("payment_status").notNull().default("pending"), // 'pending' | 'paid' | 'failed' | 'refunded'

    // Fulfillment State
    status: text("status").notNull().default("pending"), // 'pending' | 'confirmed' | 'ordered_from_supplier' | 'shipped' | 'delivered' | 'cancelled'
    
    // Dropshipping Supplier Tracking Fields
    supplierOrderId: text("supplier_order_id"),
    supplierOrderUrl: text("supplier_order_url"),
    supplierCost: numeric("supplier_cost", { precision: 10, scale: 2 }),
    supplierNotes: text("supplier_notes"),
    courierTrackingNumber: text("courier_tracking_number"),
    courierTrackingUrl: text("courier_tracking_url"),

    // Idempotency
    idempotencyKey: text("idempotency_key"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("orders_order_number_idx").on(table.orderNumber),
    uniqueIndex("orders_idempotency_key_idx").on(table.idempotencyKey),
    index("orders_customer_email_idx").on(table.customerEmail),
    index("orders_status_idx").on(table.status),
    index("orders_payment_status_idx").on(table.paymentStatus),
    index("orders_created_at_idx").on(table.createdAt),
    // Compound index for fast background polling & status aggregation
    index("orders_status_payment_created_idx").on(table.status, table.paymentStatus, table.createdAt),
  ],
);

export const orderItemsTable = pgTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    productTitle: text("product_title").notNull(),
    productHandle: text("product_handle").notNull(),
    variantId: text("variant_id").notNull(),
    variantTitle: text("variant_title").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    imageUrl: text("image_url"),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_id_idx").on(table.productId),
  ],
);
