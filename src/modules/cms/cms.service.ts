import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cmsSectionsTable } from "../../db/schema/index.js";
import { cache } from "../../lib/redis.js";

export class CmsService {
  async getSectionData(sectionKey: string): Promise<Record<string, unknown> | null> {
    const cacheKey = `cms:${sectionKey}`;
    const cached = await cache.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const [row] = await db
      .select()
      .from(cmsSectionsTable)
      .where(eq(cmsSectionsTable.sectionKey, sectionKey))
      .limit(1);

    if (!row) return null;

    const data = row.data as Record<string, unknown>;
    await cache.set(cacheKey, data, 600); // 10 minutes cache
    return data;
  }

  async updateSectionData(sectionKey: string, data: Record<string, unknown>): Promise<void> {
    await db
      .insert(cmsSectionsTable)
      .values({
        id: sectionKey,
        sectionKey,
        data,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: cmsSectionsTable.sectionKey,
        set: { data, updatedAt: new Date() },
      });

    await cache.del(`cms:${sectionKey}`);
  }
}

export const cmsService = new CmsService();
