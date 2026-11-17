import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { productsService } from "./products.service.js";
import { getProductsQuerySchema, searchProductsQuerySchema } from "./products.schema.js";

export const productsRouter = new Hono();

// GET /api/products (List products with optional pagination / collection filter)
productsRouter.get("/", zValidator("query", getProductsQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const result = await productsService.getProducts(query);
  return c.json(result);
});

// GET /api/products/search?q=... (Predictive / full search)
productsRouter.get("/search", zValidator("query", searchProductsQuerySchema), async (c) => {
  const { q, limit } = c.req.valid("query");
  const products = await productsService.search(q, limit);
  return c.json({ products });
});

// GET /api/products/:handle (Single product details)
productsRouter.get("/:handle", async (c) => {
  const handle = c.req.param("handle");
  const product = await productsService.getProductByHandle(handle);

  if (!product) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Product not found" } }, 404);
  }

  return c.json(product);
});
