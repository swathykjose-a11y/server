import { z } from "zod";
import { MAX_LINE_QUANTITY } from "../../config/store-payment.js";

export const createOrderSchema = z.object({
  customer: z.object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().max(80).optional().default(""),
    email: z.string().trim().email("Valid email is required").max(160),
    phone: z.string().trim().min(10, "Valid phone number is required").max(20),
    addressLine1: z.string().trim().min(3, "Address line 1 is required").max(200),
    addressLine2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2, "City is required").max(80),
    state: z.string().trim().min(2, "State is required").max(80),
    postalCode: z.string().trim().min(4, "Postal code is required").max(12),
    country: z.string().trim().min(2).max(56).default("India"),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(80),
        productTitle: z.string().max(200).optional(),
        productHandle: z.string().max(200).optional(),
        variantId: z.string().min(1).max(80),
        variantTitle: z.string().max(200).optional(),
        price: z.coerce.number().nonnegative().optional(),
        quantity: z.coerce.number().int().positive().max(MAX_LINE_QUANTITY),
        imageUrl: z.string().max(500).optional(),
      }),
    )
    .min(1, "Order must contain at least one item")
    .max(20),
  subtotal: z.coerce.number().nonnegative().optional(),
  shippingFee: z.coerce.number().nonnegative().optional(),
  total: z.coerce.number().nonnegative().optional(),
  paymentMethod: z.literal("upi"),
  notes: z.string().trim().max(500).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
