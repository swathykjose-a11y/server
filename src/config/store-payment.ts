/** Public store payment identity. Not a secret. */
export const STORE_UPI = {
  payeeName: "Swathy Jose",
  vpa: "swathykjose-6@okhdfcbank",
  phone: "9619408985",
} as const;

export function buildUpiUri(amountInr: number, note: string): string {
  const amount = amountInr.toFixed(2);
  const query = [
    ["pa", STORE_UPI.vpa],
    ["pn", STORE_UPI.payeeName],
    ["am", amount],
    ["cu", "INR"],
    ["tn", note],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `upi://pay?${query}`;
}

export const FREE_SHIPPING_MIN_INR = 999;
export const SHIPPING_FEE_INR = 99;
export const MAX_LINE_QUANTITY = 10;
