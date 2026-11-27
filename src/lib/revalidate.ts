import { env } from "../config/env.js";
import { logger } from "./logger.js";

export async function triggerStorefrontRevalidation(paths?: string[]): Promise<boolean> {
  const secret = process.env.REVALIDATION_SECRET || env.REVALIDATION_SECRET;
  if (!secret) {
    logger.warn("[REVALIDATE] REVALIDATION_SECRET not configured, skipping on-demand revalidation");
    return false;
  }

  const storefrontUrl = "https://daintydazzle.store";
  const targetPaths =
    paths && paths.length > 0
      ? paths
      : [
          "/",
          "/products",
          "/collections/earrings",
          "/collections/necklaces",
          "/collections/new-arrivals",
        ];

  try {
    const res = await fetch(`${storefrontUrl}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ paths: targetPaths }),
    });

    if (res.ok) {
      logger.info(
        `[REVALIDATE] Successfully revalidated paths on storefront: ${targetPaths.join(", ")}`,
      );
      return true;
    } else {
      const text = await res.text().catch(() => "");
      logger.warn(
        `[REVALIDATE] Storefront revalidation returned status ${res.status}: ${text}`,
      );
      return false;
    }
  } catch (err) {
    logger.error("[REVALIDATE] Failed to reach storefront revalidation endpoint", err);
    return false;
  }
}
