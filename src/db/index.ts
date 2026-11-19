import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";
import { logger } from "../lib/logger.js";

function getCleanDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || env.DATABASE_URL;
  return url.replace(/([?&])channel_binding=[^&]*&?/g, "$1").replace(/[?&]$/, "");
}

let _sql: any = null;
let _db: any = null;

export function getSql(): any {
  if (!_sql) {
    _sql = neon(getCleanDatabaseUrl());
  }
  return _sql;
}

export function getDb(): any {
  if (!_db) {
    _db = drizzle(getSql(), { schema });
  }
  return _db;
}

// Proxy export for transparent access everywhere in the app
export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy({} as any, {
  get(_target, prop, receiver) {
    const realDb = getDb();
    const value = Reflect.get(realDb, prop, receiver);
    return typeof value === "function" ? value.bind(realDb) : value;
  },
});

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const sql = getSql();
    const result = (await sql`SELECT 1 as connected`) as any[];
    return Boolean(result && result.length > 0);
  } catch (err) {
    logger.error("PostgreSQL database connection check failed", err);
    return false;
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  logger.info("PostgreSQL stateless connection released cleanly.");
}
