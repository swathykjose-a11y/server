import { env } from "../config/env.js";
import { logger } from "./logger.js";

interface NewOrderAlertPayload {
  orderNumber: string;
  totalInr: number;
  customerName: string;
  customerPhone: string;
  itemsSummary: string;
  transactionId: string;
}

/**
 * Dispatches zero-cost instant phone notifications to the store admin
 * via whichever free channel is configured (ntfy.sh, Telegram Bot, or CallMeBot WhatsApp).
 */
export async function sendFreeAdminPhoneAlert(payload: NewOrderAlertPayload): Promise<void> {
  const adminUrl = "https://admin.daintydazzle.store/?tab=payments";
  const message =
    `New Order ${payload.orderNumber}\n` +
    `Amount: ₹${payload.totalInr.toFixed(0)} (Verify UPI)\n` +
    `UTR / Txn ID: ${payload.transactionId}\n` +
    `Customer: ${payload.customerName} (${payload.customerPhone})\n` +
    `Items: ${payload.itemsSummary}\n` +
    `Verify payment: ${adminUrl}`;

  const tasks: Promise<unknown>[] = [];

  // 1. ntfy.sh (100% free push notifications to iOS/Android app, no account needed)
  if (env.NTFY_TOPIC) {
    tasks.push(
      fetch(`https://ntfy.sh/${encodeURIComponent(env.NTFY_TOPIC)}`, {
        method: "POST",
        headers: {
          Title: `New Order ${payload.orderNumber} — ₹${payload.totalInr.toFixed(0)}`,
          Priority: "high",
          Tags: "shopping_bags,bell",
          Click: adminUrl,
        },
        body: `UTR: ${payload.transactionId}\n${payload.customerName} (${payload.customerPhone})\n${payload.itemsSummary}\nTap to verify payment.`,
      }).catch((err) => logger.warn("ntfy alert failed", err)),
    );
  }

  // 2. Telegram Bot DM (100% free forever)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    tasks.push(
      fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: message,
          disable_web_page_preview: true,
        }),
      }).catch((err) => logger.warn("Telegram alert failed", err)),
    );
  }

  // 3. CallMeBot Free Personal WhatsApp Alert
  if (env.CALLMEBOT_PHONE && env.CALLMEBOT_API_KEY) {
    const cleanPhone = env.CALLMEBOT_PHONE.replace(/[^0-9]/g, "");
    const url =
      `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}` +
      `&text=${encodeURIComponent(message)}` +
      `&apikey=${encodeURIComponent(env.CALLMEBOT_API_KEY)}`;
    tasks.push(
      fetch(url).catch((err) => logger.warn("CallMeBot WhatsApp alert failed", err)),
    );
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }
}
