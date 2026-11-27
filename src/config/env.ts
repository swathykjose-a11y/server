import "dotenv/config";
import { z } from "zod";

const KNOWN_WEAK_SECRETS = new Set([
  "dd_admin_secret_key_change_me",
  "dd_admin_secret_fallback_key",
  "dd_revalidation_secret_key",
]);

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().default("https://api.daintydazzle.store"),
  CORS_ORIGIN: z.string().default("https://daintydazzle.store,https://www.daintydazzle.store,https://admin.daintydazzle.store,http://localhost:3000,http://localhost:3001"),

  // PostgreSQL
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/dainty_dazzle"),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Resend Email
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("Dainty Dazzle <orders@daintydazzle.store>"),
  ADMIN_NOTIFICATION_EMAIL: z.string().email().default("swathykjose@gmail.com"),
  DEVELOPER_ALERT_EMAIL: z.string().email().default("bhavartheankit@gmail.com"),

  // Cloudinary Image Storage — required only for admin uploads
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_URL: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default("development"),

  // Admin Security — no defaults. Known placeholder values are rejected.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ADMIN_API_KEY: z
    .string()
    .min(24, "ADMIN_API_KEY must be at least 24 characters")
    .refine((value) => !KNOWN_WEAK_SECRETS.has(value), "ADMIN_API_KEY is a publicly known placeholder"),
  REVALIDATION_SECRET: z
    .string()
    .min(24, "REVALIDATION_SECRET must be at least 24 characters")
    .refine((value) => !KNOWN_WEAK_SECRETS.has(value), "REVALIDATION_SECRET is a publicly known placeholder"),

  // Set only on the reverse proxy. Callers who can reach the API directly cannot supply it.
  TRUSTED_PROXY_SECRET: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z
      .string()
      .min(24, "TRUSTED_PROXY_SECRET must be at least 24 characters")
      .optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;

let _cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (_cachedEnv) return _cachedEnv;
  const result = envSchema.safeParse(process.env);
  if (result.success) {
    _cachedEnv = result.data;
    return _cachedEnv;
  }
  // During Cloudflare Worker bundle evaluation / validation, process.env is not yet populated with bindings
  return (process.env as any) || {};
}

export function reloadEnv(): Env {
  _cachedEnv = null;
  return getEnv();
}

export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    const current = getEnv();
    const val = (current as any)[prop];
    if (val !== undefined) return val;
    return (process.env as any)?.[prop];
  },
});
