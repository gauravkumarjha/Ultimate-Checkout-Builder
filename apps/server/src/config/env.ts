import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
  path.resolve(process.cwd(), "apps/server/.env"),
  path.resolve(process.cwd(), "apps/.env")
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const normalizedProcessEnv = {
  ...process.env,
  MYSQL_DATABASE: process.env.MYSQL_DATABASE ?? process.env.DB_NAME,
  MYSQL_USER: process.env.MYSQL_USER ?? process.env.DB_USERNAME,
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD ?? process.env.DB_PASSWORD
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number(),
  APP_URL: z.string().url(),
  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_SCOPES: z.string().min(1),
  MYSQL_HOST: z.string().min(1),
  MYSQL_PORT: z.coerce.number(),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string().default(""),
  MYSQL_DATABASE: z.string().min(1),
  SHOPIFY_API_VERSION: z.string().min(1),
  BILLING_AMOUNT: z.string().min(1),
  BILLING_YEARLY_AMOUNT: z.string().min(1),
  BILLING_TRIAL_DAYS: z.coerce.number()
});

export const env = envSchema.parse(normalizedProcessEnv);

export const appConfig = {
  apiVersion: env.SHOPIFY_API_VERSION,
  scopes: env.SHOPIFY_SCOPES.split(",").map((scope) => scope.trim()).filter(Boolean),
  billingAmount: env.BILLING_AMOUNT,
  billingYearlyAmount: env.BILLING_YEARLY_AMOUNT,
  billingTrialDays: env.BILLING_TRIAL_DAYS
} as const;
