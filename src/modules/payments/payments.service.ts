import { db } from "../../db/index.js";
import { paymentTransactionsTable } from "../../db/schema/index.js";
import { logger } from "../../lib/logger.js";

export class PaymentsService {
  async getPaymentConfig() {
    return {
      type: "direct_upi",
      payeeName: "Swathy Jose",
      vpa: "swathykjose-6@okhdfcbank",
      phone: "9619408985",
    };
  }

  async recordUpiTransaction(params: {
    orderId: string;
    utr?: string;
    amountInPaise: number;
    status: "PENDING" | "SUCCESS" | "FAILED";
  }) {
    const [txn] = await db
      .insert(paymentTransactionsTable)
      .values({
        id: `txn_${crypto.randomUUID()}`,
        orderId: params.orderId,
        merchantTransactionId: `UPI_${Date.now()}`,
        provider: "upi",
        amountInPaise: params.amountInPaise.toString(),
        currency: "INR",
        status: params.status,
        providerReferenceId: params.utr,
      })
      .returning();

    logger.info(`Recorded direct UPI transaction for order ${params.orderId} (UTR: ${params.utr || "N/A"})`);
    return txn;
  }
}

export const paymentsService = new PaymentsService();
