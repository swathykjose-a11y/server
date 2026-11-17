import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { collectionsTable } from "../../db/schema/index.js";
import { productsService, FormattedProduct } from "../products/products.service.js";
import { cache } from "../../lib/redis.js";

export interface FormattedCollection {
  id: string;
  handle: string;
  title: string;
  description: string;
  image?: { url: string; altText: string | null };
  products?: FormattedProduct[];
}

export class CollectionsService {
  async getCollections(): Promise<FormattedCollection[]> {
    const cacheKey = "collections:list";
    const cached = await cache.get<FormattedCollection[]>(cacheKey);
    if (cached) return cached;

    const rows = await db.select().from(collectionsTable);

    const formatted: FormattedCollection[] = rows.map((r) => ({
      id: r.id,
      handle: r.handle,
      title: r.title,
      description: r.description,
      image: r.imageUrl ? { url: r.imageUrl, altText: r.imageAlt } : undefined,
    }));

    await cache.set(cacheKey, formatted, 600);
    return formatted;
  }

  async getCollectionByHandle(handle: string): Promise<FormattedCollection | null> {
    const cacheKey = `collection:handle:${handle.toLowerCase()}`;
    const cached = await cache.get<FormattedCollection>(cacheKey);
    if (cached) return cached;

    const [row] = await db
      .select()
      .from(collectionsTable)
      .where(eq(collectionsTable.handle, handle))
      .limit(1);

    if (!row) return null;

    // Fetch products belonging to this collection
    const { products } = await productsService.getProducts({ collection: handle, first: 50 });

    const formatted: FormattedCollection = {
      id: row.id,
      handle: row.handle,
      title: row.title,
      description: row.description,
      image: row.imageUrl ? { url: row.imageUrl, altText: row.imageAlt } : undefined,
      products,
    };

    await cache.set(cacheKey, formatted, 600);
    return formatted;
  }
}

export const collectionsService = new CollectionsService();
