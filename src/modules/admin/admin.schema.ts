import { z } from "zod";

export const updateOrderStatusSchema = z.object({
  status: z
    .enum(["pending", "confirmed", "ordered_from_supplier", "shipped", "delivered", "cancelled"])
    .optional(),
  paymentStatus: z
    .enum(["pending", "paid", "failed", "refunded"])
    .optional(),
  paymentMethod: z
    .enum(["upi", "cod", "online"])
    .optional(),
  supplierOrderId: z.string().optional(),
  supplierOrderUrl: z.string().url().optional().or(z.literal("")),
  supplierCost: z.coerce.number().optional(),
  supplierNotes: z.string().optional(),
  courierTrackingNumber: z.string().optional(),
  courierTrackingUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export const verifyPaymentSchema = z.object({
  paymentStatus: z.enum(["paid", "failed", "refunded"]).default("paid"),
  utr: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  autoConfirmOrder: z.boolean().default(true),
});

export const upsertProductSchema = z.object({
  id: z.string().optional(),
  handle: z.string().min(1),
  title: z.string().min(1),
  descriptionHtml: z.string().default(""),
  availableForSale: z.boolean().default(true),
  totalInventory: z.coerce.number().default(0),
  minPrice: z.coerce.number().positive(),
  compareAtPrice: z.coerce.number().positive().optional(),
  tags: z.array(z.string()).default([]),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        altText: z.string().nullable().optional(),
      }),
    )
    .default([]),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        availableForSale: z.boolean().default(true),
        quantityAvailable: z.coerce.number().default(0),
        price: z.coerce.number().positive(),
        compareAtPrice: z.coerce.number().positive().optional(),
      }),
    )
    .min(1, "At least one variant is required"),
  collectionIds: z.array(z.string()).optional(),
});
