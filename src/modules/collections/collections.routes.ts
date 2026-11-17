import { Hono } from "hono";
import { collectionsService } from "./collections.service.js";

export const collectionsRouter = new Hono();

// GET /api/collections (List all collections)
collectionsRouter.get("/", async (c) => {
  const collections = await collectionsService.getCollections();
  return c.json(collections);
});

// GET /api/collections/:handle (Collection details with products)
collectionsRouter.get("/:handle", async (c) => {
  const handle = c.req.param("handle");
  const collection = await collectionsService.getCollectionByHandle(handle);

  if (!collection) {
    return c.json({ success: false, error: { code: "NOT_FOUND", message: "Collection not found" } }, 404);
  }

  return c.json(collection);
});
