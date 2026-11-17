import { pgTable, text, numeric, timestamp, jsonb, index, uniqueIndex, integer } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders.js";

export const paymentTransactionsTable = pgTable(
  "payment_transactions",
  {
    id: text("id").primaryKey(), // uuid
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    merchantTransactionId: text("merchant_transaction_id").notNull(),
    provider: text("provider").notNull().default("phonepe"), // 'phonepe'
    amountInPaise: numeric("amount_in_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status").notNull().default("PENDING"), // 'PENDING' | 'SUCCESS' | 'FAILED'
    providerReferenceId: text("provider_reference_id"),
    providerResponseCode: text("provider_response_code"),
    rawResponse: jsonb("raw_response"),
    pollCount: integer("poll_count").default(0),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payment_merchant_txn_id_idx").on(table.merchantTransactionId),
    index("payment_order_id_idx").on(table.orderId),
    index("payment_status_idx").on(table.status),
    // Critical index for DB polling worker: find pending transactions efficiently
    index("payment_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const pollingAuditLogsTable = pgTable(
  "polling_audit_logs",
  {
    id: text("id").primaryKey(),
    jobName: text("job_name").notNull(),
    workerId: text("worker_id").notNull(),
    recordsChecked: integer("records_checked").default(0),
    recordsUpdated: integer("records_updated").default(0),
    status: text("status").notNull(), // 'SUCCESS' | 'FAILED'
    details: jsonb("details"),
    durationMs: integer("duration_ms").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("polling_audit_created_idx").on(table.createdAt),
    index("polling_audit_job_idx").on(table.jobName),
  ],
);
