import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const rootEnvPath = path.resolve(process.cwd(), "..", "..", ".env");
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

const normalizedProcessEnv = {
  ...process.env,
  MYSQL_DATABASE: process.env.MYSQL_DATABASE ?? process.env.DB_NAME,
  MYSQL_USER: process.env.MYSQL_USER ?? process.env.DB_USERNAME,
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  APP_URL: z.string().url(),
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_SCOPES: z.string().default("write_checkouts,read_checkouts,read_customers,write_customers,read_metaobject_definitions,write_metaobject_definitions,read_metaobjects,write_metaobjects,read_products,write_products,customer_read_metaobjects,unauthenticated_read_metaobjects"),
  MYSQL_HOST: z.string().default("localhost"),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().default(""),
  MYSQL_DATABASE: z.string().min(1),
  SHOPIFY_API_VERSION: z.string().default("2026-01"),
  BILLING_AMOUNT: z.string().default("5.00"),
  BILLING_YEARLY_AMOUNT: z.string().default("50.00"),
  BILLING_TRIAL_DAYS: z.coerce.number().default(3)
});

export const env = envSchema.parse(normalizedProcessEnv);

export const appConfig = {
  apiVersion: env.SHOPIFY_API_VERSION,
  scopes: env.SHOPIFY_SCOPES.split(",").map((scope) => scope.trim()).filter(Boolean),
  billingAmount: env.BILLING_AMOUNT,
  billingYearlyAmount: env.BILLING_YEARLY_AMOUNT,
  billingTrialDays: env.BILLING_TRIAL_DAYS
} as const;
