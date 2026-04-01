import { Router } from "express";
import { normalizeCheckoutSettings } from "@saas/shared";
import { env } from "../config/env";
import { getSettings, getShop, getSubscription, upsertSettings } from "../db/repositories";
import { requireShopAuth, type AuthedRequest } from "../middleware/auth";
import { isBillingActive, reconcileBilling, startBillingFlow } from "../services/billing";
import { syncFrontendMetafield } from "../services/metafields";

export const apiRouter = Router();

apiRouter.get("/shops/:shop/settings", requireShopAuth, async (req: AuthedRequest, res) => {
  const shop = req.params.shop;
  if (req.shopDomain !== shop) {
    res.status(403).json({ error: "Shop mismatch" });
    return;
  }

  const settings = await getSettings(shop);
  const subscription = await getSubscription(shop);
  const shopRecord = await getShop(shop);

  res.json({
    shop: shopRecord
      ? {
          shop_domain: shopRecord.shop_domain,
          shop_name: shopRecord.shop_name,
          plan: shopRecord.plan,
          is_active: shopRecord.is_active
        }
      : null,
    settings,
    subscription,
    isBillingActive: await isBillingActive(shop)
  });
});

apiRouter.put("/shops/:shop/settings", requireShopAuth, async (req: AuthedRequest, res) => {
  const shop = req.params.shop;
  if (req.shopDomain !== shop) {
    res.status(403).json({ error: "Shop mismatch" });
    return;
  }

  const shopRecord = req.shopRecord ?? (await getShop(shop));
  if (!shopRecord?.access_token) {
    res.status(404).json({ error: "Shop not connected" });
    return;
  }

  const subscriptionActive = await isBillingActive(shop);
  if (!subscriptionActive) {
    res.status(402).json({ error: "Subscription inactive", billingRequired: true });
    return;
  }

  let parsed: ReturnType<typeof normalizeCheckoutSettings>;
  try {
    parsed = normalizeCheckoutSettings(req.body);
  } catch (error) {
    res.status(400).json({
      error: "Invalid settings payload",
      details: error instanceof Error ? error.message : "Unknown validation error"
    });
    return;
  }

  if (!/plus/i.test(shopRecord.plan)) {
    parsed.payments = {
      ...parsed.payments,
      enabled: false,
      fallbackMode: "display_only"
    };
  }

  try {
    await upsertSettings(shop, parsed);
    await syncFrontendMetafield(shop, shopRecord.access_token, parsed, /plus/i.test(shopRecord.plan));
    res.json({
      ok: true,
      settings: parsed
    });
  } catch (error) {
    res.status(502).json({
      error: "Failed to sync frontend config",
      details: error instanceof Error ? error.message : "Unknown sync error"
    });
  }
});

apiRouter.post("/shops/:shop/sync", requireShopAuth, async (req: AuthedRequest, res) => {
  const shop = req.params.shop;
  if (req.shopDomain !== shop) {
    res.status(403).json({ error: "Shop mismatch" });
    return;
  }

  const shopRecord = req.shopRecord ?? (await getShop(shop));
  if (!shopRecord?.access_token) {
    res.status(404).json({ error: "Shop not connected" });
    return;
  }

  if (!(await isBillingActive(shop))) {
    res.status(402).json({ error: "Subscription inactive", billingRequired: true });
    return;
  }

  const settings = await getSettings(shop);
  await syncFrontendMetafield(shop, shopRecord.access_token, settings, /plus/i.test(shopRecord.plan));

  res.json({ ok: true });
});

apiRouter.post("/shops/:shop/billing", requireShopAuth, async (req: AuthedRequest, res) => {
  const shop = req.params.shop;
  if (req.shopDomain !== shop) {
    res.status(403).json({ error: "Shop mismatch" });
    return;
  }

  const shopRecord = req.shopRecord ?? (await getShop(shop));
  if (!shopRecord?.access_token) {
    res.status(404).json({ error: "Shop not connected" });
    return;
  }

  const billingCycle = req.body?.billingCycle === "yearly" ? "yearly" : "monthly";
  const returnUrl = `${env.APP_URL}/?shop=${encodeURIComponent(shop)}&billing=success`;
  const billing = await startBillingFlow(shop, shopRecord.access_token, returnUrl, billingCycle);
  res.json(billing);
});

apiRouter.post("/shops/:shop/billing/reconcile", requireShopAuth, async (req: AuthedRequest, res) => {
  const shop = req.params.shop;
  if (req.shopDomain !== shop) {
    res.status(403).json({ error: "Shop mismatch" });
    return;
  }

  const shopRecord = req.shopRecord ?? (await getShop(shop));
  if (!shopRecord?.access_token) {
    res.status(404).json({ error: "Shop not connected" });
    return;
  }

  await reconcileBilling(shop, shopRecord.access_token);
  res.json({ ok: true });
});
