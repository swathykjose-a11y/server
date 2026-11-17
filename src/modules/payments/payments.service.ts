import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { paymentTransactionsTable } from "../../db/schema/index.js";
import { ordersService } from "../orders/orders.service.js";
import { phonePeService } from "../../lib/phonepe.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../middlewares/error-handler.js";

export class PaymentsService {
  async initiatePhonePePayment(orderId: string) {
    const order = await ordersService.getOrderById(orderId);

    if (order.paymentStatus === "paid") {
      throw new AppError("Order is already paid", 400, "ORDER_ALREADY_PAID");
    }

    const merchantTransactionId = `MT_${order.orderNumber.replace(/[^a-zA-Z0-9]/g, "")}_${Date.now()}`;
    const amountInPaise = Math.round(order.total * 100);

    // Save pending transaction in DB
    const [txn] = await db
      .insert(paymentTransactionsTable)
      .values({
        id: `txn_${crypto.randomUUID()}`,
        orderId: order.id,
        merchantTransactionId,
        provider: "phonepe",
        amountInPaise: amountInPaise.toString(),
        currency: "INR",
        status: "PENDING",
      })
      .returning();

    logger.info(`Created payment transaction ${txn.merchantTransactionId} for order ${order.orderNumber}`);

    const result = await phonePeService.initiatePayment({
      merchantTransactionId,
      merchantUserId: `USR_${order.customer.email.replace(/[^a-zA-Z0-9]/g, "")}`,
      amountInPaise,
      redirectUrl: `${env.PHONEPE_REDIRECT_URL}?orderId=${order.id}&transactionId=${merchantTransactionId}`,
      callbackUrl: env.PHONEPE_CALLBACK_URL,
      mobileNumber: order.customer.phone,
    });

    if (!result.success || !result.redirectUrl) {
      await db
        .update(paymentTransactionsTable)
        .set({ status: "FAILED", updatedAt: new Date(), rawResponse: result.rawResponse as any })
        .where(eq(paymentTransactionsTable.id, txn.id));

      throw new AppError(result.message || "Failed to initiate payment with PhonePe", 502, "PAYMENT_GATEWAY_ERROR");
    }

    return {
      success: true,
      redirectUrl: result.redirectUrl,
      merchantTransactionId,
    };
  }

  async handlePhonePeWebhook(base64Response: string, xVerifyHeader: string): Promise<{ success: boolean; message: string }> {
    // 1. Verify webhook signature
    const isValid = phonePeService.verifyWebhook(base64Response, xVerifyHeader);
    if (!isValid) {
      logger.warn("Received PhonePe webhook with invalid checksum signature");
      throw new AppError("Invalid webhook signature", 401, "UNAUTHORIZED_WEBHOOK");
    }

    // 2. Decode payload
    const decoded = phonePeService.decodeWebhookPayload<{
      success: boolean;
      code: string;
      message: string;
      data?: {
        merchantTransactionId: string;
        transactionId: string;
        amount: number;
        state: "COMPLETED" | "FAILED" | "PENDING";
        responseCode: string;
      };
    }>(base64Response);

    if (!decoded || !decoded.data?.merchantTransactionId) {
      throw new AppError("Malformed webhook payload", 400, "MALFORMED_WEBHOOK");
    }

    const { merchantTransactionId, state, transactionId, responseCode } = decoded.data;

    // 3. Find transaction record
    const [existingTxn] = await db
      .select()
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.merchantTransactionId, merchantTransactionId))
      .limit(1);

    if (!existingTxn) {
      logger.error(`Webhook received for unknown transaction: ${merchantTransactionId}`);
      throw new AppError("Transaction record not found", 404, "TRANSACTION_NOT_FOUND");
    }

    // Idempotency: if already processed as SUCCESS, return early
    if (existingTxn.status === "SUCCESS") {
      logger.info(`Webhook idempotency: transaction ${merchantTransactionId} already recorded as SUCCESS`);
      return { success: true, message: "Transaction already processed" };
    }

    // 4. Update transaction & order status
    if (decoded.success && (state === "COMPLETED" || responseCode === "SUCCESS")) {
      await db
        .update(paymentTransactionsTable)
        .set({
          status: "SUCCESS",
          providerReferenceId: transactionId,
          providerResponseCode: responseCode,
          rawResponse: decoded as any,
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactionsTable.id, existingTxn.id));

      await ordersService.markOrderAsPaid(existingTxn.orderId);
      logger.info(`PhonePe Webhook: Order ${existingTxn.orderId} marked as PAID`);
    } else {
      await db
        .update(paymentTransactionsTable)
        .set({
          status: "FAILED",
          providerReferenceId: transactionId,
          providerResponseCode: responseCode,
          rawResponse: decoded as any,
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactionsTable.id, existingTxn.id));

      logger.warn(`PhonePe Webhook: Payment failed for transaction ${merchantTransactionId} (code: ${responseCode})`);
    }

    return { success: true, message: "Webhook processed successfully" };
  }

  async checkStatusAndReconcile(merchantTransactionId: string) {
    const statusResult = await phonePeService.checkStatus(merchantTransactionId);

    const [existingTxn] = await db
      .select()
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.merchantTransactionId, merchantTransactionId))
      .limit(1);

    if (!existingTxn) {
      throw new AppError("Transaction not found", 404, "TRANSACTION_NOT_FOUND");
    }

    if (existingTxn.status === "SUCCESS") {
      return { status: "SUCCESS", orderId: existingTxn.orderId };
    }

    if (statusResult.success && statusResult.data?.state === "COMPLETED") {
      await db
        .update(paymentTransactionsTable)
        .set({
          status: "SUCCESS",
          providerReferenceId: statusResult.data.transactionId,
          providerResponseCode: statusResult.data.responseCode,
          rawResponse: statusResult as any,
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactionsTable.id, existingTxn.id));

      await ordersService.markOrderAsPaid(existingTxn.orderId);
      return { status: "SUCCESS", orderId: existingTxn.orderId };
    } else if (statusResult.data?.state === "FAILED") {
      await db
        .update(paymentTransactionsTable)
        .set({
          status: "FAILED",
          providerResponseCode: statusResult.data.responseCode,
          rawResponse: statusResult as any,
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactionsTable.id, existingTxn.id));

      return { status: "FAILED", orderId: existingTxn.orderId };
    }

    return { status: "PENDING", orderId: existingTxn.orderId };
  }
}

export const paymentsService = new PaymentsService();
