import { Router } from "express";
import { appConfig, env } from "../config/env";
import { createStateToken, verifyQueryHmac } from "../lib/hmac";
import { buildInstallUrl, exchangeCodeForToken, fetchShopInfo, normalizeShopDomain, registerWebhooks } from "../lib/shopify";
import { upsertShop, upsertSettings, upsertSubscription } from "../db/repositories";
import { defaultCheckoutSettings } from "@saas/shared";

export const authRouter = Router();

authRouter.get("/", async (req, res) => {
  const shop = normalizeShopDomain(String(req.query.shop ?? ""));
  if (!shop) {
    res.status(400).send("Missing shop parameter");
    return;
  }

  const state = createStateToken();
  res.cookie("shopify_oauth_state", state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000
  });
  res.redirect(buildInstallUrl(shop, state));
});

authRouter.get("/callback", async (req, res) => {
  const shop = normalizeShopDomain(String(req.query.shop ?? ""));
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  const cookieState = req.cookies?.shopify_oauth_state;
  const callbackUrl = new URL(`https://${req.get("host")}${req.originalUrl}`);

  if (!shop || !code) {
    res.status(400).send("Invalid OAuth callback");
    return;
  }

  if (!verifyQueryHmac(callbackUrl.searchParams, env.SHOPIFY_API_SECRET)) {
    res.status(400).send("Invalid OAuth signature");
    return;
  }

  if (!cookieState || cookieState !== state) {
    res.status(400).send("Invalid OAuth state");
    return;
  }

  const accessToken = await exchangeCodeForToken(shop, code);
  const shopInfo = await fetchShopInfo(shop, accessToken);

  await upsertShop({
    shopDomain: shopInfo.myshopifyDomain,
    shopName: shopInfo.name,
    accessToken,
    scope: appConfig.scopes.join(","),
    plan: shopInfo.planName,
    isActive: true
  });

  await upsertSettings(shopInfo.myshopifyDomain, defaultCheckoutSettings);
  await upsertSubscription({
    shopDomain: shopInfo.myshopifyDomain,
    status: "trial",
    trialEnd: new Date(Date.now() + env.BILLING_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    billingCycle: "monthly"
  });

  await registerWebhooks(shopInfo.myshopifyDomain, accessToken, env.APP_URL);

  res.clearCookie("shopify_oauth_state");
  res.redirect(`${env.APP_URL}/?shop=${encodeURIComponent(shopInfo.myshopifyDomain)}`);
});
