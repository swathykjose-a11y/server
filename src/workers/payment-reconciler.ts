import crypto from "crypto";
import { and, eq, lte, gte } from "drizzle-orm";
import { db } from "../db/index.js";
import { paymentTransactionsTable, pollingAuditLogsTable } from "../db/schema/index.js";
import { paymentsService } from "../modules/payments/payments.service.js";
import { cache } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

const WORKER_ID = `worker_${process.pid}_${crypto.randomUUID().slice(0, 6)}`;
const LOCK_KEY = "worker:payment-reconciliation";
const LOCK_TTL_SECONDS = 55; // Must be slightly shorter than interval

export class PaymentReconcilerWorker {
  private intervalTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;

  start(intervalMs = 60000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info(`🔄 [DB Polling Worker] Payment Reconciler started (${WORKER_ID}, interval: ${intervalMs / 1000}s)`);

    // Initial run after brief delay
    setTimeout(() => this.poll(), 5000);

    this.intervalTimer = setInterval(() => {
      this.poll();
    }, intervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    logger.info(`🛑 [DB Polling Worker] Payment Reconciler stopped gracefully (${WORKER_ID})`);
  }

  private async poll(): Promise<void> {
    if (this.isProcessing) {
      logger.debug(`[DB Polling Worker] Previous tick still active, skipping.`);
      return;
    }

    // 1. Acquire distributed lock via Upstash Redis
    const lockAcquired = await cache.acquireLock(LOCK_KEY, LOCK_TTL_SECONDS);
    if (!lockAcquired) {
      logger.debug(`[DB Polling Worker] Another node holds the lock. Skipping this tick.`);
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();
    let recordsChecked = 0;
    let recordsUpdated = 0;
    const auditDetails: Array<{ txnId: string; prev: string; next: string }> = [];

    try {
      // Find pending transactions created between 2 minutes ago and 60 minutes ago
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000);

      const pendingTxns = await db
        .select()
        .from(paymentTransactionsTable)
        .where(
          and(
            eq(paymentTransactionsTable.status, "PENDING"),
            lte(paymentTransactionsTable.createdAt, twoMinutesAgo),
            gte(paymentTransactionsTable.createdAt, sixtyMinutesAgo),
          ),
        )
        .limit(25); // Batched for database performance

      recordsChecked = pendingTxns.length;

      if (recordsChecked > 0) {
        logger.info(`[DB Polling Worker] Found ${recordsChecked} pending payment transactions to reconcile`);

        for (const txn of pendingTxns) {
          try {
            // Update poll count
            await db
              .update(paymentTransactionsTable)
              .set({
                pollCount: (txn.pollCount || 0) + 1,
                lastPolledAt: new Date(),
              })
              .where(eq(paymentTransactionsTable.id, txn.id));

            // Check status directly with PhonePe & reconcile
            const result = await paymentsService.checkStatusAndReconcile(txn.merchantTransactionId);

            if (result.status !== "PENDING") {
              recordsUpdated++;
              auditDetails.push({
                txnId: txn.merchantTransactionId,
                prev: txn.status,
                next: result.status,
              });
              logger.info(`[DB Polling Worker] Reconciled txn ${txn.merchantTransactionId} -> ${result.status}`);
            }
          } catch (itemErr) {
            logger.error(`[DB Polling Worker] Error reconciling transaction ${txn.merchantTransactionId}`, itemErr);
          }
        }
      }

      // Record audit log
      const durationMs = Date.now() - startTime;
      if (recordsChecked > 0) {
        await db.insert(pollingAuditLogsTable).values({
          id: `audit_${crypto.randomUUID()}`,
          jobName: "payment_reconciliation",
          workerId: WORKER_ID,
          recordsChecked,
          recordsUpdated,
          status: "SUCCESS",
          details: auditDetails as any,
          durationMs,
        });
      }
    } catch (err) {
      logger.error("[DB Polling Worker] Fatal error during polling cycle", err);
    } finally {
      this.isProcessing = false;
      await cache.releaseLock(LOCK_KEY);
    }
  }
}

export const paymentReconciler = new PaymentReconcilerWorker();
