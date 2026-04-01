import { Router } from "express";
import { env } from "../config/env";
import { markShopUninstalled, recordWebhookEvent, updateShopDetails } from "../db/repositories";
import { verifyWebhookHmac } from "../lib/hmac";

export const webhooksRouter = Router();

webhooksRouter.post("/shopify", async (req, res) => {
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  const hmac = req.header("X-Shopify-Hmac-Sha256") ?? undefined;
  if (!verifyWebhookHmac(rawBody, hmac, env.SHOPIFY_API_SECRET)) {
    res.status(401).send("Invalid webhook signature");
    return;
  }

  const topic = req.header("X-Shopify-Topic") ?? "APP_UNINSTALLED";
  const shopDomain = req.header("X-Shopify-Shop-Domain") ?? "";
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    res.status(400).send("Invalid webhook payload");
    return;
  }

  await recordWebhookEvent(topic, shopDomain, payload);
  if (topic === "APP_UNINSTALLED") {
    await markShopUninstalled(shopDomain);
  } else if (topic === "SHOP_UPDATE") {
    await updateShopDetails({
      shopDomain,
      isActive: true
    });
  }

  res.status(200).send("OK");
});
