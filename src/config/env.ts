import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().default("http://localhost:8787"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

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

  // PhonePe Payment Gateway
  PHONEPE_ENV: z.enum(["UAT", "PRODUCTION"]).default("UAT"),
  PHONEPE_MERCHANT_ID: z.string().default("PGTESTPAYUAT"),
  PHONEPE_SALT_KEY: z.string().default("96434309-7796-489d-8924-ab56988a6076"),
  PHONEPE_SALT_INDEX: z.coerce.number().default(1),
  PHONEPE_REDIRECT_URL: z.string().default("http://localhost:3000/checkout/payment-status"),
  PHONEPE_CALLBACK_URL: z.string().default("http://localhost:8787/api/payments/phonepe-webhook"),

  // Sentry
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default("development"),

  // Admin Security
  ADMIN_API_KEY: z.string().default("dd_admin_secret_key_change_me"),
  REVALIDATION_SECRET: z.string().default("dd_revalidation_secret_key"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment configuration. Please check your .env file.");
  }

  return result.data;
}

export const env = loadEnv();
