import { z } from "zod";

export const getProductsQuerySchema = z.object({
  first: z.coerce.number().min(1).max(100).default(20),
  after: z.string().optional(),
  collection: z.string().optional(),
  search: z.string().optional(),
});

export const searchProductsQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});
