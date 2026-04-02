import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  APP_URL: z.string().url(),
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_SCOPES: z.string().default("read_products,write_products,read_customers,write_customers,read_metafields,write_metafields,write_checkouts"),
  MYSQL_HOST: z.string().default("localhost"),
  MYSQL_PORT: z.coerce.number().default(3308),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().min(1),
  MYSQL_DATABASE: z.string().min(1),
  SHOPIFY_API_VERSION: z.string().default("2025-04"),
  BILLING_AMOUNT: z.string().default("5.00"),
  BILLING_YEARLY_AMOUNT: z.string().default("50.00"),
  BILLING_TRIAL_DAYS: z.coerce.number().default(3)
});

export const env = envSchema.parse(process.env);

export const appConfig = {
  apiVersion: env.SHOPIFY_API_VERSION,
  scopes: env.SHOPIFY_SCOPES.split(",").map((scope) => scope.trim()).filter(Boolean),
  billingAmount: env.BILLING_AMOUNT,
  billingYearlyAmount: env.BILLING_YEARLY_AMOUNT,
  billingTrialDays: env.BILLING_TRIAL_DAYS
} as const;
