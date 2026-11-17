import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";
import { logger } from "../lib/logger.js";

// Connection pooling configuration for scalability under high traffic
const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === "production" ? 25 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // suppress verbose notices in console
});

export const db = drizzle(client, { schema });

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await client`SELECT 1 as connected`;
    return result.length > 0;
  } catch (err) {
    logger.error("PostgreSQL database connection check failed", err);
    return false;
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  try {
    await client.end({ timeout: 5 });
    logger.info("PostgreSQL database connection pool closed cleanly.");
  } catch (err) {
    logger.error("Error closing PostgreSQL connection pool", err);
  }
}
