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
  async ensureCollection(title: string): Promise<string> {
    const handle = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `col_${handle.replace(/-/g, "_")}`;

    const [existing] = await db
      .select()
      .from(collectionsTable)
      .where(eq(collectionsTable.handle, handle))
      .limit(1);

    if (existing) {
      return existing.id;
    }

    await db
      .insert(collectionsTable)
      .values({
        id,
        handle,
        title,
        description: `Handcrafted ${title.toLowerCase()} collection designed for everyday elegance.`,
      })
      .onConflictDoNothing();

    await cache.del("collections:list");
    return id;
  }

  async getCollections(): Promise<FormattedCollection[]> {
    const cacheKey = "collections:list";
    const cached = await cache.get<FormattedCollection[]>(cacheKey);
    if (cached) return cached;

    // Ensure default collections exist if table is empty
    let rows = await db.select().from(collectionsTable);
    if (rows.length === 0) {
      await this.ensureCollection("Earrings");
      await this.ensureCollection("Necklaces");
      rows = await db.select().from(collectionsTable);
    }

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
    const cleanHandle = handle.toLowerCase().trim();
    const cacheKey = `collection:handle:${cleanHandle}`;
    const cached = await cache.get<FormattedCollection>(cacheKey);
    if (cached) return cached;

    let [row] = await db
      .select()
      .from(collectionsTable)
      .where(eq(collectionsTable.handle, cleanHandle))
      .limit(1);

    if (!row) {
      // Auto-ensure standard collection (e.g. necklaces -> Necklaces, earrings -> Earrings)
      const title = cleanHandle.charAt(0).toUpperCase() + cleanHandle.slice(1);
      const colId = await this.ensureCollection(title);
      [row] = await db.select().from(collectionsTable).where(eq(collectionsTable.id, colId)).limit(1);
    }

    if (!row) return null;

    // Fetch products belonging to this collection
    const { products } = await productsService.getProducts({ collection: cleanHandle, first: 50 });

    const formatted: FormattedCollection = {
      id: row.id,
      handle: row.handle,
      title: row.title,
      description: row.description || `Explore our handcrafted ${row.title.toLowerCase()} collection.`,
      image: row.imageUrl ? { url: row.imageUrl, altText: row.imageAlt } : undefined,
      products,
    };

    await cache.set(cacheKey, formatted, 600);
    return formatted;
  }
}

export const collectionsService = new CollectionsService();
