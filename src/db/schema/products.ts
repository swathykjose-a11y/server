import { pgTable, text, boolean, integer, numeric, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

export const productsTable = pgTable(
  "products",
  {
    id: text("id").primaryKey(), // e.g. prod_01 or uuid
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    descriptionHtml: text("description_html").notNull().default(""),
    availableForSale: boolean("available_for_sale").notNull().default(true),
    totalInventory: integer("total_inventory").default(0),
    minPrice: numeric("min_price", { precision: 10, scale: 2 }).notNull(),
    compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("INR"),
    tags: jsonb("tags").$type<string[]>().default([]),
    images: jsonb("images").$type<Array<{ url: string; altText: string | null }>>().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("products_handle_idx").on(table.handle),
    index("products_active_idx").on(table.isActive),
    index("products_available_idx").on(table.availableForSale),
    index("products_created_at_idx").on(table.createdAt),
  ],
);

export const productVariantsTable = pgTable(
  "product_variants",
  {
    id: text("id").primaryKey(), // e.g. var_01_gold
    productId: text("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    availableForSale: boolean("available_for_sale").notNull().default(true),
    quantityAvailable: integer("quantity_available").default(0),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
    currency: text("currency").notNull().default("INR"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("variants_product_id_idx").on(table.productId),
    index("variants_available_idx").on(table.availableForSale),
  ],
);
