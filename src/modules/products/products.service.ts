import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { productsTable, productVariantsTable, collectionsTable, collectionProductsTable } from "../../db/schema/index.js";
import { cache } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";

export interface FormattedProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  availableForSale: boolean;
  totalInventory: number | null;
  priceRange: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  compareAtPriceRange?: {
    minVariantPrice: { amount: string; currencyCode: string };
  };
  images: Array<{ url: string; altText: string | null }>;
  variants: Array<{
    id: string;
    title: string;
    availableForSale: boolean;
    quantityAvailable: number | null;
    price: { amount: string; currencyCode: string };
    compareAtPrice?: { amount: string; currencyCode: string };
  }>;
  tags: string[];
}

export class ProductsService {
  private formatProduct(row: typeof productsTable.$inferSelect, variants: Array<typeof productVariantsTable.$inferSelect>): FormattedProduct {
    return {
      id: row.id,
      handle: row.handle,
      title: row.title,
      descriptionHtml: row.descriptionHtml,
      availableForSale: row.availableForSale,
      totalInventory: row.totalInventory,
      priceRange: {
        minVariantPrice: {
          amount: parseFloat(row.minPrice).toFixed(0),
          currencyCode: row.currency,
        },
      },
      compareAtPriceRange: row.compareAtPrice
        ? {
            minVariantPrice: {
              amount: parseFloat(row.compareAtPrice).toFixed(0),
              currencyCode: row.currency,
            },
          }
        : undefined,
      images: row.images || [],
      variants: variants.map((v) => ({
        id: v.id,
        title: v.title,
        availableForSale: v.availableForSale,
        quantityAvailable: v.quantityAvailable,
        price: {
          amount: parseFloat(v.price).toFixed(0),
          currencyCode: v.currency,
        },
        compareAtPrice: v.compareAtPrice
          ? {
              amount: parseFloat(v.compareAtPrice).toFixed(0),
              currencyCode: v.currency,
            }
          : undefined,
      })),
      tags: row.tags || [],
    };
  }

  async getProducts(params: { first?: number; after?: string; collection?: string; search?: string }): Promise<{
    products: FormattedProduct[];
    pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
  }> {
    const limit = params.first || 20;
    const cacheKey = `products:list:${JSON.stringify(params)}`;

    const cached = await cache.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    let query = db
      .select({ product: productsTable })
      .from(productsTable)
      .where(eq(productsTable.isActive, true))
      .orderBy(desc(productsTable.createdAt))
      .limit(limit + 1);

    // If filtered by collection
    if (params.collection) {
      const colRows = await db
        .select({ product: productsTable })
        .from(productsTable)
        .innerJoin(collectionProductsTable, eq(productsTable.id, collectionProductsTable.productId))
        .innerJoin(collectionsTable, eq(collectionProductsTable.collectionId, collectionsTable.id))
        .where(and(eq(productsTable.isActive, true), eq(collectionsTable.handle, params.collection)))
        .orderBy(desc(productsTable.createdAt))
        .limit(limit + 1);

      return this.enrichAndPaginate(colRows.map((r) => r.product), limit, cacheKey);
    }

    // If search keyword provided
    if (params.search) {
      const searchPattern = `%${params.search}%`;
      const searchRows = await db
        .select()
        .from(productsTable)
        .where(
          and(
            eq(productsTable.isActive, true),
            or(ilike(productsTable.title, searchPattern), ilike(productsTable.handle, searchPattern)),
          ),
        )
        .orderBy(desc(productsTable.createdAt))
        .limit(limit + 1);

      return this.enrichAndPaginate(searchRows, limit, cacheKey);
    }

    const rows = await query;
    return this.enrichAndPaginate(rows.map((r) => r.product), limit, cacheKey);
  }

  private async enrichAndPaginate(products: Array<typeof productsTable.$inferSelect>, limit: number, cacheKey: string) {
    const hasNextPage = products.length > limit;
    const paged = hasNextPage ? products.slice(0, limit) : products;

    if (paged.length === 0) {
      const emptyResult = {
        products: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
      };
      await cache.set(cacheKey, emptyResult, 300);
      return emptyResult;
    }

    const productIds = paged.map((p) => p.id);
    const variants = await db
      .select()
      .from(productVariantsTable)
      .where(sql`${productVariantsTable.productId} IN ${productIds}`);

    const variantMap = new Map<string, Array<typeof productVariantsTable.$inferSelect>>();
    for (const v of variants) {
      const list = variantMap.get(v.productId) || [];
      list.push(v);
      variantMap.set(v.productId, list);
    }

    const formatted = paged.map((p) => this.formatProduct(p, variantMap.get(p.id) || []));

    const result = {
      products: formatted,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: false,
        startCursor: formatted.length > 0 ? formatted[0].id : null,
        endCursor: formatted.length > 0 ? formatted[formatted.length - 1].id : null,
      },
    };

    // Cache list for 5 minutes
    await cache.set(cacheKey, result, 300);
    return result;
  }

  async getProductByHandle(handle: string): Promise<FormattedProduct | null> {
    const cacheKey = `product:handle:${handle.toLowerCase()}`;
    const cached = await cache.get<FormattedProduct>(cacheKey);
    if (cached) return cached;

    const [row] = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.handle, handle), eq(productsTable.isActive, true)))
      .limit(1);

    if (!row) return null;

    const variants = await db
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, row.id));

    const formatted = this.formatProduct(row, variants);
    await cache.set(cacheKey, formatted, 600); // 10 minutes cache
    return formatted;
  }

  async search(query: string, limit = 20): Promise<FormattedProduct[]> {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];

    const cacheKey = `search:${trimmed}:${limit}`;
    const cached = await cache.get<FormattedProduct[]>(cacheKey);
    if (cached) return cached;

    const searchPattern = `%${trimmed}%`;
    const rows = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.isActive, true),
          or(ilike(productsTable.title, searchPattern), ilike(productsTable.handle, searchPattern)),
        ),
      )
      .limit(limit);

    if (rows.length === 0) {
      await cache.set(cacheKey, [], 180);
      return [];
    }

    const ids = rows.map((r) => r.id);
    const variants = await db
      .select()
      .from(productVariantsTable)
      .where(sql`${productVariantsTable.productId} IN ${ids}`);

    const variantMap = new Map<string, Array<typeof productVariantsTable.$inferSelect>>();
    for (const v of variants) {
      const list = variantMap.get(v.productId) || [];
      list.push(v);
      variantMap.set(v.productId, list);
    }

    const formatted = rows.map((r) => this.formatProduct(r, variantMap.get(r.id) || []));
    await cache.set(cacheKey, formatted, 180);
    return formatted;
  }

  async invalidateCache(handle?: string): Promise<void> {
    if (handle) {
      await cache.del(`product:handle:${handle.toLowerCase()}`);
    }
    // Delete listing caches or set short TTL
    logger.info(`Product cache invalidated for handle: ${handle || "all"}`);
  }
}

export const productsService = new ProductsService();
