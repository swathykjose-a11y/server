import { Hono } from "hono";

export const paymentsRouter = new Hono();

// Storefront checkout is direct UPI only (QR, UPI ID, Phone Number).
paymentsRouter.all("/initiate", async (c) => {
  return c.json(
    {
      success: false,
      error: {
        code: "DIRECT_UPI_ONLY",
        message: "Dainty Dazzle uses direct UPI payments (QR Code, UPI ID, Phone). Third-party gateways are disabled.",
      },
    },
    410,
  );
});

paymentsRouter.all("/phonepe-webhook", async (c) => {
  return c.json({ success: true, message: "Legacy gateway webhook retired." }, 200);
});

paymentsRouter.get("/info", async (c) => {
  return c.json({
    success: true,
    method: "upi",
    vpa: "swathykjose-6@okhdfcbank",
    phone: "9619408985",
    payeeName: "Swathy Jose",
  });
});
