import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

export const adminsTable = pgTable(
  "admins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default("Admin"),
    role: text("role").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_admins_email").on(table.email),
  ],
);

export type Admin = typeof adminsTable.$inferSelect;
export type NewAdmin = typeof adminsTable.$inferInsert;
