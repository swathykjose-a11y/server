import { pgTable, text, timestamp, uniqueIndex, integer, primaryKey, index } from "drizzle-orm/pg-core";
import { productsTable } from "./products.js";

export const collectionsTable = pgTable(
  "collections",
  {
    id: text("id").primaryKey(), // e.g. col_earrings
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    imageAlt: text("image_alt"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("collections_handle_idx").on(table.handle),
  ],
);

export const collectionProductsTable = pgTable(
  "collection_products",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collectionsTable.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.productId] }),
    index("col_prod_col_id_idx").on(table.collectionId),
    index("col_prod_prod_id_idx").on(table.productId),
  ],
);
