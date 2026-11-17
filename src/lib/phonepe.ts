import crypto from "crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export interface InitiatePaymentParams {
  merchantTransactionId: string;
  merchantUserId: string;
  amountInPaise: number; // amount in paise (1 INR = 100 paise)
  redirectUrl: string;
  callbackUrl: string;
  mobileNumber?: string;
}

export interface PaymentInitiationResult {
  success: boolean;
  redirectUrl?: string;
  merchantTransactionId: string;
  message?: string;
  rawResponse?: unknown;
}

export interface PaymentStatusResult {
  success: boolean;
  code: string;
  message: string;
  data?: {
    merchantId: string;
    merchantTransactionId: string;
    transactionId: string;
    amount: number;
    state: "COMPLETED" | "FAILED" | "PENDING";
    responseCode: string;
    paymentInstrument?: Record<string, unknown>;
  };
}

class PhonePeService {
  private baseUrl: string;
  private merchantId: string;
  private saltKey: string;
  private saltIndex: number;

  constructor() {
    this.merchantId = env.PHONEPE_MERCHANT_ID;
    this.saltKey = env.PHONEPE_SALT_KEY;
    this.saltIndex = env.PHONEPE_SALT_INDEX;

    this.baseUrl =
      env.PHONEPE_ENV === "PRODUCTION"
        ? "https://api.phonepe.com/apis/hermes"
        : "https://api-preprod.phonepe.com/apis/pg-sandbox";

    logger.info(`💳 PhonePe client configured for [${env.PHONEPE_ENV}] environment`);
  }

  /**
   * Generates SHA256 checksum according to PhonePe specifications:
   * SHA256(payload + endpoint + saltKey) + "###" + saltIndex
   */
  private generateChecksum(payload: string, endpoint: string): string {
    const stringToHash = `${payload}${endpoint}${this.saltKey}`;
    const hash = crypto.createHash("sha256").update(stringToHash).digest("hex");
    return `${hash}###${this.saltIndex}`;
  }

  /**
   * Initiates payment on PhonePe Standard Checkout
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitiationResult> {
    const endpoint = "/pg/v1/pay";
    const url = `${this.baseUrl}${endpoint}`;

    const payload = {
      merchantId: this.merchantId,
      merchantTransactionId: params.merchantTransactionId,
      merchantUserId: params.merchantUserId,
      amount: params.amountInPaise,
      redirectUrl: params.redirectUrl,
      redirectMode: "POST",
      callbackUrl: params.callbackUrl,
      mobileNumber: params.mobileNumber || "9999999999",
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
    const checksum = this.generateChecksum(base64Payload, endpoint);

    try {
      logger.info(`Initiating PhonePe payment for transaction ${params.merchantTransactionId} (${params.amountInPaise / 100} INR)`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          Accept: "application/json",
        },
        body: JSON.stringify({ request: base64Payload }),
      });

      const json = (await response.json()) as {
        success?: boolean;
        message?: string;
        data?: {
          instrumentResponse?: {
            redirectInfo?: {
              url?: string;
            };
          };
        };
      };

      if (json.success && json.data?.instrumentResponse?.redirectInfo?.url) {
        return {
          success: true,
          redirectUrl: json.data.instrumentResponse.redirectInfo.url,
          merchantTransactionId: params.merchantTransactionId,
          rawResponse: json,
        };
      }

      logger.error("PhonePe payment initiation failed", json);
      return {
        success: false,
        merchantTransactionId: params.merchantTransactionId,
        message: json.message || "Failed to initiate payment with PhonePe",
        rawResponse: json,
      };
    } catch (err) {
      logger.error("PhonePe payment initiation network exception", err);
      return {
        success: false,
        merchantTransactionId: params.merchantTransactionId,
        message: "Network error connecting to PhonePe",
      };
    }
  }

  /**
   * Check payment status directly from PhonePe API
   */
  async checkStatus(merchantTransactionId: string): Promise<PaymentStatusResult> {
    const endpoint = `/pg/v1/status/${this.merchantId}/${merchantTransactionId}`;
    const url = `${this.baseUrl}${endpoint}`;
    const checksum = this.generateChecksum("", endpoint);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": checksum,
          "X-MERCHANT-ID": this.merchantId,
        },
      });

      const json = (await response.json()) as PaymentStatusResult;
      return json;
    } catch (err) {
      logger.error(`Failed to check PhonePe status for transaction ${merchantTransactionId}`, err);
      return {
        success: false,
        code: "INTERNAL_ERROR",
        message: "Failed to communicate with PhonePe status API",
      };
    }
  }

  /**
   * Validates PhonePe server-to-server webhook callback signature
   */
  verifyWebhook(base64Response: string, xVerifyHeader: string): boolean {
    if (!xVerifyHeader) return false;
    const computed = this.generateChecksum(base64Response, "");
    return computed === xVerifyHeader;
  }

  /**
   * Decodes webhook response payload
   */
  decodeWebhookPayload<T>(base64Response: string): T | null {
    try {
      const decoded = Buffer.from(base64Response, "base64").toString("utf-8");
      return JSON.parse(decoded) as T;
    } catch (err) {
      logger.error("Failed to decode PhonePe webhook base64 payload", err);
      return null;
    }
  }
}

export const phonePeService = new PhonePeService();
