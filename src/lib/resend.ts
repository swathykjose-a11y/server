import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { STORE_UPI } from "../config/store-payment.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface EmailOrderItem {
  title: string;
  variantTitle?: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}

interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: EmailOrderItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
}

export interface ServerErrorAlertData {
  error: Error | unknown;
  context?: string;
  requestId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

class EmailService {
  private resend: Resend | null = null;
  private recentErrorAlerts = new Map<string, number>();

  constructor() {
    if (env.RESEND_API_KEY) {
      this.resend = new Resend(env.RESEND_API_KEY);
      logger.info("[EMAIL] Resend Email client initialized");
    } else {
      logger.warn("[EMAIL WARNING] RESEND_API_KEY not configured. Outgoing emails will be logged only.");
    }
  }

  /**
   * Send order confirmation email to the customer
   */
  async sendOrderConfirmationToCustomer(data: OrderEmailData): Promise<boolean> {
    const itemsHtml = data.items
      .map(
        (item) => `
        <tr style="border-bottom: 1px solid #EAE7E2;">
          <td style="padding: 12px 8px; font-size: 13px; color: #232220;">
            <strong>${escapeHtml(item.title)}</strong>
            ${item.variantTitle ? `<br><span style="font-size: 11px; color: #737871;">${escapeHtml(item.variantTitle)}</span>` : ""}
          </td>
          <td style="padding: 12px 8px; font-size: 13px; text-align: center; color: #232220;">${escapeHtml(item.quantity)}</td>
          <td style="padding: 12px 8px; font-size: 13px; text-align: right; color: #232220;">₹${(item.price * item.quantity).toFixed(0)}</td>
        </tr>`,
      )
      .join("");

    const fullAddress = escapeHtml(
      `${data.shippingAddress.addressLine1}${
        data.shippingAddress.addressLine2 ? `, ${data.shippingAddress.addressLine2}` : ""
      }, ${data.shippingAddress.city}, ${data.shippingAddress.state} - ${data.shippingAddress.postalCode}`,
    );
    const awaitingUpi = data.paymentStatus !== "paid";
    const customerName = escapeHtml(data.customerName);

    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F5F0; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #EAE7E2; border-radius: 4px; overflow: hidden; }
          .header { background-color: #232220; color: #FFFFFF; padding: 32px 24px; text-align: center; }
          .header h1 { margin: 0; font-family: Georgia, serif; font-size: 26px; font-weight: normal; letter-spacing: 0.05em; }
          .header p { margin: 8px 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.2em; color: #C5BFB6; }
          .content { padding: 32px 24px; }
          .badge { display: inline-block; background-color: #ECEEEA; color: #364035; padding: 4px 10px; font-size: 11px; border-radius: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
          .summary-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
          .total-box { background-color: #F7F5F0; padding: 16px; border-radius: 4px; margin-top: 20px; }
          .footer { padding: 24px; text-align: center; font-size: 11px; color: #737871; border-top: 1px solid #EAE7E2; background-color: #FAF9F6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Dainty Dazzle</h1>
            <p>Everyday Fine Jewelry</p>
          </div>
          <div class="content">
            <span class="badge">${awaitingUpi ? "Payment required" : "Order Confirmed"}</span>
            <h2 style="font-family: Georgia, serif; font-size: 20px; color: #232220; margin: 16px 0 8px;">Thank you for your order, ${customerName}!</h2>
            <p style="font-size: 13px; color: #5B6258; line-height: 1.6;">
              ${
                awaitingUpi
                  ? `Pay <strong>₹${data.total.toFixed(0)}</strong> by UPI to <strong>${escapeHtml(STORE_UPI.payeeName)}</strong> (${escapeHtml(STORE_UPI.vpa)}, phone ${escapeHtml(STORE_UPI.phone)}) and use note <strong>#${escapeHtml(data.orderNumber)}</strong>. There is no cash on delivery. We dispatch the order after this payment is received.`
                  : `We have received your order <strong>#${escapeHtml(data.orderNumber)}</strong>. Each piece is handcrafted with care. You will receive a separate shipping notification with a tracking number once your package is dispatched.`
              }
            </p>

            <table class="summary-table">
              <thead>
                <tr style="border-bottom: 2px solid #232220;">
                  <th style="text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #737871;">Item</th>
                  <th style="text-align: center; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #737871;">Qty</th>
                  <th style="text-align: right; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #737871;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="total-box">
              <div style="display: flex; justify-content: space-between; font-size: 13px; color: #5B6258; margin-bottom: 6px;">
                <span>Subtotal:</span>
                <span>₹${data.subtotal.toFixed(0)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; color: #5B6258; margin-bottom: 6px;">
                <span>Shipping:</span>
                <span>${data.shippingFee === 0 ? "FREE" : `₹${data.shippingFee.toFixed(0)}`}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; color: #232220; border-top: 1px solid #EAE7E2; padding-top: 8px; margin-top: 8px;">
                <span>Total Amount:</span>
                <span>₹${data.total.toFixed(0)}</span>
              </div>
            </div>

            <div style="margin-top: 24px; padding: 16px; border: 1px solid #EAE7E2; border-radius: 4px;">
              <h3 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #232220; margin: 0 0 8px;">Delivery Details</h3>
              <p style="font-size: 13px; color: #5B6258; margin: 0; line-height: 1.5;">
                <strong>${customerName}</strong><br>
                ${fullAddress}<br>
                Phone: ${escapeHtml(data.customerPhone)}<br>
                Payment: <strong style="text-transform: uppercase;">${escapeHtml(data.paymentMethod)}</strong> (${escapeHtml(data.paymentStatus)})
              </p>
            </div>
          </div>
          <div class="footer">
            <p style="margin: 0;">Questions? Reply to this email or write to us at support@daintydazzle.store</p>
            <p style="margin: 6px 0 0;">© ${new Date().getFullYear()} Dainty Dazzle. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>`;

    return this.sendMail({
      to: data.customerEmail,
      subject: `${awaitingUpi ? "Pay by UPI" : "Order Confirmed"}: #${data.orderNumber} - Dainty Dazzle`,
      html,
    });
  }

  /**
   * Send new order notification to the brand owner/admin (swathykjose@gmail.com)
   * with customer shipping information to easily order from the supplier website (dropshipping).
   */
  async sendNewOrderAlertToAdmin(data: OrderEmailData): Promise<boolean> {
    const adminEmail = env.ADMIN_NOTIFICATION_EMAIL;

    const itemsSummary = data.items
      .map(
        (item) => `
        <li>
          <strong>${escapeHtml(item.quantity)}x ${escapeHtml(item.title)}</strong>
          ${item.variantTitle ? `(${escapeHtml(item.variantTitle)})` : ""} - ₹${(item.price * item.quantity).toFixed(0)}
        </li>`,
      )
      .join("");

    const fullAddress = escapeHtml(
      `${data.shippingAddress.addressLine1}${
        data.shippingAddress.addressLine2 ? `, ${data.shippingAddress.addressLine2}` : ""
      }, ${data.shippingAddress.city}, ${data.shippingAddress.state} - ${data.shippingAddress.postalCode}, ${data.shippingAddress.country}`,
    );
    const customerName = escapeHtml(data.customerName);
    const awaitingUpi = data.paymentStatus !== "paid";

    const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, sans-serif; padding: 20px; background-color: #F8F9FA; color: #212529;">
        <div style="max-width: 640px; margin: 0 auto; background: #FFFFFF; padding: 28px; border: 1px solid #DEE2E6; border-radius: 6px;">
          <h2 style="color: #0D6EFD; margin-top: 0;">[New Order] Customer Order: #${escapeHtml(data.orderNumber)}</h2>
          <p style="font-size: 14px; background: #FFF3CD; padding: 12px; border-left: 4px solid #FFC107; border-radius: 2px;">
            ${
              awaitingUpi
                ? `<strong>UPI payment pending.</strong> Do not order from the supplier until ₹${data.total.toFixed(0)} arrives on ${escapeHtml(STORE_UPI.vpa)} (${escapeHtml(STORE_UPI.phone)}) with note #${escapeHtml(data.orderNumber)}. Cash on delivery is not offered.`
                : `<strong>Dropshipping action required:</strong> Payment is received. Order the products from your supplier and use the customer's delivery address below.`
            }
          </p>

          <h3>Ordered Items:</h3>
          <ul style="font-size: 14px; line-height: 1.8;">
            ${itemsSummary}
          </ul>

          <p><strong>Order total:</strong> ₹${data.total.toFixed(0)} (${escapeHtml(data.paymentMethod.toUpperCase())} - ${escapeHtml(data.paymentStatus)})</p>

          <hr style="border: none; border-top: 1px solid #DEE2E6; margin: 20px 0;">

          <h3>Customer Shipping Address (Copy to Supplier):</h3>
          <div style="background: #F1F3F5; padding: 16px; border-radius: 4px; font-family: monospace; font-size: 13px; line-height: 1.6;">
            Name: ${customerName}<br>
            Phone: ${escapeHtml(data.customerPhone)}<br>
            Email: ${escapeHtml(data.customerEmail)}<br>
            Address Line 1: ${escapeHtml(data.shippingAddress.addressLine1)}<br>
            Address Line 2: ${escapeHtml(data.shippingAddress.addressLine2 || "N/A")}<br>
            City: ${escapeHtml(data.shippingAddress.city)}<br>
            State: ${escapeHtml(data.shippingAddress.state)}<br>
            PIN Code: ${escapeHtml(data.shippingAddress.postalCode)}<br>
            Country: ${escapeHtml(data.shippingAddress.country)}<br><br>
            Full Address Line:<br>
            ${customerName}, ${fullAddress}, Phone: ${escapeHtml(data.customerPhone)}
          </div>

          <p style="margin-top: 24px; font-size: 12px; color: #6C757D;">
            This automated email was sent to ${adminEmail} by Dainty Dazzle Backend Server.
          </p>
        </div>
      </body>
    </html>`;

    return this.sendMail({
      to: adminEmail,
      subject: `[Dropship Alert] New Order #${data.orderNumber} placed by ${data.customerName} (₹${data.total.toFixed(0)})`,
      html,
    });
  }

  /**
   * Send server error / issue alert to developer (bhavartheankit@gmail.com).
   * Includes 60-second rate-limiting per unique signature to prevent email flooding.
   */
  async sendServerErrorAlert(data: ServerErrorAlertData): Promise<boolean> {
    const devEmail = env.DEVELOPER_ALERT_EMAIL;
    const errorMessage =
      data.error instanceof Error
        ? data.error.message
        : String(data.error || "Unknown server error");
    const errorStack =
      data.error instanceof Error && data.error.stack
        ? data.error.stack
        : "No stack trace available";

    // Deduplicate / rate-limit identical error alerts within 60 seconds
    const errorSignature = `${data.method || ""}:${data.path || ""}:${errorMessage}`;
    const now = Date.now();
    const lastAlertTime = this.recentErrorAlerts.get(errorSignature) || 0;
    if (now - lastAlertTime < 60000) {
      logger.warn(`Throttling error alert email for signature: ${errorSignature}`);
      return false;
    }
    this.recentErrorAlerts.set(errorSignature, now);

    const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background-color: #0F172A; color: #F8FAFC;">
        <div style="max-width: 680px; margin: 0 auto; background: #1E293B; padding: 28px; border: 1px solid #334155; border-radius: 8px;">
          <h2 style="color: #EF4444; margin-top: 0; font-size: 20px;">
            [Server Error Alert] ${escapeHtml(data.context || "Unhandled Backend Exception")}
          </h2>
          <p style="font-size: 14px; color: #94A3B8;">
            An issue was captured on the Dainty Dazzle Backend Server (<strong>${env.NODE_ENV}</strong>).
          </p>

          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; color: #CBD5E1;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #334155; width: 140px; color: #94A3B8;">Method & Path:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #334155; font-family: monospace; color: #38BDF8;">
                ${escapeHtml(data.method || "N/A")} ${escapeHtml(data.path || "N/A")}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #334155; color: #94A3B8;">Request ID:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #334155; font-family: monospace;">
                ${escapeHtml(data.requestId || "N/A")}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #334155; color: #94A3B8;">Timestamp:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #334155;">
                ${new Date().toISOString()}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #334155; color: #94A3B8;">Error Message:</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #334155; color: #F87171; font-weight: bold;">
                ${escapeHtml(errorMessage)}
              </td>
            </tr>
          </table>

          <h4 style="margin: 20px 0 8px; color: #E2E8F0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Stack Trace:</h4>
          <pre style="background: #0F172A; padding: 14px; border-radius: 6px; font-family: 'SFMono-Regular', Consolas, Monaco, monospace; font-size: 12px; color: #FCA5A5; overflow-x: auto; white-space: pre-wrap; line-height: 1.5; border: 1px solid #334155;">${escapeHtml(errorStack)}</pre>

          ${
            data.metadata
              ? `
          <h4 style="margin: 20px 0 8px; color: #E2E8F0; font-size: 13px; text-transform: uppercase;">Metadata:</h4>
          <pre style="background: #0F172A; padding: 14px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #94A3B8; overflow-x: auto; border: 1px solid #334155;">${escapeHtml(
            JSON.stringify(data.metadata, null, 2),
          )}</pre>`
              : ""
          }

          <p style="margin-top: 24px; font-size: 11px; color: #64748B;">
            Sent automatically to ${devEmail} by Dainty Dazzle Error Monitoring Service.
          </p>
        </div>
      </body>
    </html>`;

    return this.sendMail({
      to: devEmail,
      subject: `[Server Issue] ${data.method ? `${data.method} ` : ""}${data.path || data.context || "Backend Error"}: ${errorMessage.slice(0, 80)}`,
      html,
    });
  }

  private async sendMail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
    if (!this.resend) {
      logger.info(`[Email Service Simulation] Sent to: ${to} | Subject: ${subject}`);
      return true;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to,
        subject,
        html,
      });

      if (error) {
        logger.error(`Resend failed to deliver email to ${to}`, error);
        return false;
      }

      logger.info(`Email successfully dispatched via Resend to ${to} (id: ${data?.id})`);
      return true;
    } catch (err) {
      logger.error(`Unexpected error during email dispatch to ${to}`, err);
      return false;
    }
  }
}

export const emailService = new EmailService();
