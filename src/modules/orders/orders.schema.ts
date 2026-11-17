import { z } from "zod";

export const createOrderSchema = z.object({
  customer: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().optional().default(""),
    email: z.string().email("Valid email is required"),
    phone: z.string().min(10, "Valid phone number is required"),
    addressLine1: z.string().min(3, "Address line 1 is required"),
    addressLine2: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    postalCode: z.string().min(4, "Postal code is required"),
    country: z.string().default("India"),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        productTitle: z.string().min(1),
        productHandle: z.string().min(1),
        variantId: z.string().min(1),
        variantTitle: z.string().min(1),
        price: z.coerce.number().positive(),
        quantity: z.coerce.number().int().positive(),
        imageUrl: z.string().optional(),
      }),
    )
    .min(1, "Order must contain at least one item"),
  subtotal: z.coerce.number().nonnegative(),
  shippingFee: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().positive(),
  paymentMethod: z.enum(["cod", "online", "phonepe", "upi"]).default("cod"),
  notes: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
