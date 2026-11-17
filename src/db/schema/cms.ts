import { pgTable, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const cmsSectionsTable = pgTable(
  "cms_sections",
  {
    id: text("id").primaryKey(), // e.g. hero, featured, editorial, story, bottom-banner
    sectionKey: text("section_key").notNull(),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("cms_section_key_idx").on(table.sectionKey),
  ],
);
