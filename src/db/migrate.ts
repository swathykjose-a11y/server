import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

async function runMigrations() {
  logger.info("⏳ Running database migrations...");

  const migrationClient = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    logger.info("✅ Database migrations applied successfully!");
  } catch (err) {
    logger.error("❌ Migration failed", err);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

runMigrations();
