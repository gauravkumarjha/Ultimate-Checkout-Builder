import crypto from "crypto";
import { execute, select } from "./client";
import { CheckoutSettings, defaultCheckoutSettings } from "@saas/shared";
import { env } from "../config/env";

export type ShopRow = {
  id: string;
  shop_domain: string;
  shop_name: string;
  access_token: string | null;
  scope: string;
  plan: string;
  installed_at: string;
  is_active: number | boolean;
};

export type SettingsRow = {
  id: string;
  shop_id: string;
  review_config: string;
  timer_config: string;
  custom_fields: string;
  css: string | null;
  translations: string;
  payment_config: string;
  feature_flags: string;
  config_backup: string;
};

export type SubscriptionRow = {
  id: string;
  shop_id: string;
  status: "active" | "cancelled" | "trial" | string;
  trial_end: string | null;
  billing_cycle: string;
  charge_id: string | null;
  confirmation_url: string | null;
};

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(env.SHOPIFY_API_SECRET).digest();
}

function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decryptToken(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const buffer = Buffer.from(payload, "base64");
    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const data = buffer.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function getShopId(shopDomain: string): Promise<string | null> {
  const rows = await select<{ id: string }>("SELECT id FROM shops WHERE shop_domain = ? LIMIT 1", [shopDomain]);
  return rows[0]?.id ?? null;
}

async function getShopRowById(shopId: string): Promise<ShopRow | null> {
  const rows = await select<Omit<ShopRow, "access_token"> & { access_token: string | null }>(
    "SELECT id, shop_domain, shop_name, access_token, scope, plan, installed_at, is_active FROM shops WHERE id = ? LIMIT 1",
    [shopId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    access_token: decryptToken(row.access_token)
  };
}

export async function upsertShop(input: {
  shopDomain: string;
  shopName: string;
  accessToken: string;
  scope: string;
  plan: string;
  isActive?: boolean;
}): Promise<ShopRow> {
  await execute(
    `
      INSERT INTO shops (shop_domain, shop_name, access_token, scope, plan, is_active, installed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        shop_name = VALUES(shop_name),
        access_token = VALUES(access_token),
        scope = VALUES(scope),
        plan = VALUES(plan),
        is_active = VALUES(is_active),
        updated_at = NOW()
    `,
    [input.shopDomain, input.shopName, encryptToken(input.accessToken), input.scope, input.plan, input.isActive ?? true ? 1 : 0]
  );

  const rows = await select<ShopRow>(
    "SELECT id, shop_domain, shop_name, access_token, scope, plan, installed_at, is_active FROM shops WHERE shop_domain = ? LIMIT 1",
    [input.shopDomain]
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to load shop after upsert: ${input.shopDomain}`);
  }
  return {
    ...row,
    access_token: decryptToken(row.access_token)
  };
}

export async function markShopUninstalled(shopDomain: string): Promise<void> {
  await execute(
    `
      UPDATE shops
      SET is_active = 0,
          access_token = NULL,
          updated_at = NOW()
      WHERE shop_domain = ?
    `,
    [shopDomain]
  );
}

export async function updateShopDetails(input: {
  shopDomain: string;
  scope?: string;
  isActive?: boolean;
}): Promise<void> {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.scope !== undefined) {
    updates.push("scope = ?");
    values.push(input.scope);
  }
  if (input.isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(input.isActive ? 1 : 0);
  }

  if (!updates.length) return;
  updates.push("updated_at = NOW()");
  values.push(input.shopDomain);

  await execute(`UPDATE shops SET ${updates.join(", ")} WHERE shop_domain = ?`, values);
}

export async function getShop(shopDomain: string): Promise<ShopRow | null> {
  const rows = await select<ShopRow>(
    "SELECT id, shop_domain, shop_name, access_token, scope, plan, installed_at, is_active FROM shops WHERE shop_domain = ? LIMIT 1",
    [shopDomain]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    access_token: decryptToken(row.access_token)
  };
}

function normalizeSettings(config: CheckoutSettings): CheckoutSettings {
  return config;
}

export async function upsertSettings(shopDomain: string, config: CheckoutSettings): Promise<void> {
  const shopId = await getShopId(shopDomain);
  if (!shopId) {
    throw new Error(`Unknown shop: ${shopDomain}`);
  }

  const payload = normalizeSettings(config);
  await execute(
    `
      INSERT INTO settings (
        shop_id,
        review_config,
        timer_config,
        custom_fields,
        css,
        translations,
        payment_config,
        feature_flags,
        config_backup,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        review_config = VALUES(review_config),
        timer_config = VALUES(timer_config),
        custom_fields = VALUES(custom_fields),
        css = VALUES(css),
        translations = VALUES(translations),
        payment_config = VALUES(payment_config),
        feature_flags = VALUES(feature_flags),
        config_backup = VALUES(config_backup),
        updated_at = NOW()
    `,
    [
      shopId,
      JSON.stringify(payload.reviews),
      JSON.stringify(payload.timer),
      JSON.stringify(payload.customFields),
      payload.css.enabled ? payload.css.customCss : null,
      JSON.stringify(payload.translations),
      JSON.stringify(payload.payments),
      JSON.stringify(payload.featureFlags),
      JSON.stringify(payload)
    ]
  );
}

export async function getSettings(shopDomain: string): Promise<CheckoutSettings> {
  const shopId = await getShopId(shopDomain);
  if (!shopId) {
    return defaultCheckoutSettings;
  }

  const rows = await select<SettingsRow>("SELECT * FROM settings WHERE shop_id = ? LIMIT 1", [shopId]);
  const row = rows[0];
  if (!row) {
    return defaultCheckoutSettings;
  }

  try {
    const backup = JSON.parse(row.config_backup) as CheckoutSettings;
    return backup;
  } catch {
    return defaultCheckoutSettings;
  }
}

export async function upsertSubscription(input: {
  shopDomain: string;
  status: "active" | "cancelled" | "trial" | string;
  trialEnd?: string | null;
  billingCycle?: string;
  chargeId?: string | null;
  confirmationUrl?: string | null;
}): Promise<SubscriptionRow> {
  const shopId = await getShopId(input.shopDomain);
  if (!shopId) {
    throw new Error(`Unknown shop: ${input.shopDomain}`);
  }

  await execute(
    `
      INSERT INTO subscriptions (
        shop_id,
        status,
        trial_end,
        billing_cycle,
        charge_id,
        confirmation_url,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        trial_end = VALUES(trial_end),
        billing_cycle = VALUES(billing_cycle),
        charge_id = VALUES(charge_id),
        confirmation_url = VALUES(confirmation_url),
        updated_at = NOW()
    `,
    [
      shopId,
      input.status,
      input.trialEnd ?? null,
      input.billingCycle ?? "monthly",
      input.chargeId ?? null,
      input.confirmationUrl ?? null
    ]
  );

  const rows = await select<SubscriptionRow>("SELECT * FROM subscriptions WHERE shop_id = ? LIMIT 1", [shopId]);
  return rows[0];
}

export async function getSubscription(shopDomain: string): Promise<SubscriptionRow | null> {
  const shopId = await getShopId(shopDomain);
  if (!shopId) return null;
  const rows = await select<SubscriptionRow>("SELECT * FROM subscriptions WHERE shop_id = ? LIMIT 1", [shopId]);
  return rows[0] ?? null;
}

export async function recordWebhookEvent(topic: string, shopDomain: string, payload: unknown): Promise<void> {
  await execute(
    `INSERT INTO webhook_events (topic, shop_domain, payload) VALUES (?, ?, ?)`,
    [topic, shopDomain, JSON.stringify(payload)]
  );
}
