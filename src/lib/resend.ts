import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

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

class EmailService {
  private resend: Resend | null = null;

  constructor() {
    if (env.RESEND_API_KEY) {
      this.resend = new Resend(env.RESEND_API_KEY);
      logger.info("📧 Resend Email client initialized");
    } else {
      logger.warn("⚠️ RESEND_API_KEY not configured. Outgoing emails will be logged only.");
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
            <strong>${item.title}</strong>
            ${item.variantTitle ? `<br><span style="font-size: 11px; color: #737871;">${item.variantTitle}</span>` : ""}
          </td>
          <td style="padding: 12px 8px; font-size: 13px; text-align: center; color: #232220;">${item.quantity}</td>
          <td style="padding: 12px 8px; font-size: 13px; text-align: right; color: #232220;">₹${(item.price * item.quantity).toFixed(0)}</td>
        </tr>`,
      )
      .join("");

    const fullAddress = `${data.shippingAddress.addressLine1}${
      data.shippingAddress.addressLine2 ? `, ${data.shippingAddress.addressLine2}` : ""
    }, ${data.shippingAddress.city}, ${data.shippingAddress.state} - ${data.shippingAddress.postalCode}`;

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
            <span class="badge">Order Confirmed</span>
            <h2 style="font-family: Georgia, serif; font-size: 20px; color: #232220; margin: 16px 0 8px;">Thank you for your order, ${data.customerName}!</h2>
            <p style="font-size: 13px; color: #5B6258; line-height: 1.6;">
              We have received your order <strong>#${data.orderNumber}</strong>. Each piece is handcrafted with care. You will receive a separate shipping notification with a tracking number once your package is dispatched.
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
                <strong>${data.customerName}</strong><br>
                ${fullAddress}<br>
                Phone: ${data.customerPhone}<br>
                Payment: <strong style="text-transform: uppercase;">${data.paymentMethod}</strong> (${data.paymentStatus})
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
      subject: `Order Confirmed: #${data.orderNumber} - Dainty Dazzle`,
      html,
    });
  }

  /**
   * Send new order notification to the brand owner/admin at bhavartheankit@gmail.com
   * with customer shipping information to easily order from the supplier website (dropshipping).
   */
  async sendNewOrderAlertToAdmin(data: OrderEmailData): Promise<boolean> {
    const adminEmail = env.ADMIN_NOTIFICATION_EMAIL;

    const itemsSummary = data.items
      .map(
        (item) => `
        <li>
          <strong>${item.quantity}x ${item.title}</strong>
          ${item.variantTitle ? `(${item.variantTitle})` : ""} - ₹${(item.price * item.quantity).toFixed(0)}
        </li>`,
      )
      .join("");

    const fullAddress = `${data.shippingAddress.addressLine1}${
      data.shippingAddress.addressLine2 ? `, ${data.shippingAddress.addressLine2}` : ""
    }, ${data.shippingAddress.city}, ${data.shippingAddress.state} - ${data.shippingAddress.postalCode}, ${data.shippingAddress.country}`;

    const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, sans-serif; padding: 20px; background-color: #F8F9FA; color: #212529;">
        <div style="max-width: 640px; margin: 0 auto; background: #FFFFFF; padding: 28px; border: 1px solid #DEE2E6; border-radius: 6px;">
          <h2 style="color: #0D6EFD; margin-top: 0;">🚀 New Customer Order: #${data.orderNumber}</h2>
          <p style="font-size: 14px; background: #FFF3CD; padding: 12px; border-left: 4px solid #FFC107; border-radius: 2px;">
            <strong>Dropshipping Action Required:</strong> A customer just bought this on Dainty Dazzle. Please order the products from your supplier and enter the customer's delivery address below.
          </p>

          <h3>📦 Ordered Items:</h3>
          <ul style="font-size: 14px; line-height: 1.8;">
            ${itemsSummary}
          </ul>

          <p><strong>Customer Paid Total:</strong> ₹${data.total.toFixed(0)} (${data.paymentMethod.toUpperCase()} - ${data.paymentStatus})</p>

          <hr style="border: none; border-top: 1px solid #DEE2E6; margin: 20px 0;">

          <h3>📍 Customer Shipping Address (Copy to Supplier):</h3>
          <div style="background: #F1F3F5; padding: 16px; border-radius: 4px; font-family: monospace; font-size: 13px; line-height: 1.6;">
            Name: ${data.customerName}<br>
            Phone: ${data.customerPhone}<br>
            Email: ${data.customerEmail}<br>
            Address Line 1: ${data.shippingAddress.addressLine1}<br>
            Address Line 2: ${data.shippingAddress.addressLine2 || "N/A"}<br>
            City: ${data.shippingAddress.city}<br>
            State: ${data.shippingAddress.state}<br>
            PIN Code: ${data.shippingAddress.postalCode}<br>
            Country: ${data.shippingAddress.country}<br><br>
            Full Address Line:<br>
            ${data.customerName}, ${fullAddress}, Phone: ${data.customerPhone}
          </div>

          <p style="margin-top: 24px; font-size: 12px; color: #6C757D;">
            This automated email was sent to ${adminEmail} by Dainty Dazzle Backend Server.
          </p>
        </div>
      </body>
    </html>`;

    return this.sendMail({
      to: adminEmail,
      subject: `🚨 [Dropship Alert] New Order #${data.orderNumber} placed by ${data.customerName} (₹${data.total.toFixed(0)})`,
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
