import { appConfig, env } from "../config/env";
import { verifyQueryHmac } from "./hmac";

export type ShopifyShopInfo = {
  id: string;
  name: string;
  myshopifyDomain: string;
  planName: string;
  isPlus: boolean;
};

export function buildInstallUrl(shop: string, state: string): string {
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  authUrl.searchParams.set("scope", appConfig.scopes.join(","));
  authUrl.searchParams.set("redirect_uri", `${env.APP_URL}/auth/callback`);
  authUrl.searchParams.set("state", state);
  return authUrl.toString();
}

export function normalizeShopDomain(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim().toLowerCase();
}

export async function exchangeCodeForToken(shop: string, code: string): Promise<string> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.SHOPIFY_API_KEY,
      client_secret: env.SHOPIFY_API_SECRET,
      code
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange code for token: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function fetchShopInfo(shop: string, accessToken: string): Promise<ShopifyShopInfo> {
  const query = `
    query ShopInfo {
      shop {
        id
        name
        myshopifyDomain
        plan {
          displayName
          partnerDevelopment
        }
      }
    }
  `;

  const response = await shopifyGraphQL<{ shop: { id: string; name: string; myshopifyDomain: string; plan: { displayName: string; partnerDevelopment: boolean } } }>(
    shop,
    accessToken,
    query
  );

  return {
    id: response.shop.id,
    name: response.shop.name,
    myshopifyDomain: response.shop.myshopifyDomain,
    planName: response.shop.plan.displayName,
    isPlus: /plus/i.test(response.shop.plan.displayName)
  };
}

export async function shopifyGraphQL<T>(shop: string, accessToken: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://${shop}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status}`);
  }

  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) {
    throw new Error(body.errors.map((item) => item.message).join("; "));
  }
  if (!body.data) {
    throw new Error("Missing GraphQL response data");
  }
  return body.data;
}

export async function registerWebhooks(shop: string, accessToken: string, appUrl: string): Promise<void> {
  const query = `
    mutation RegisterWebhooks($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
      webhookSubscriptionCreate(
        topic: $topic
        webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
      ) {
        webhookSubscription { id topic callbackUrl }
        userErrors { field message }
      }
    }
  `;

  const callbackUrl = `${appUrl}/webhooks/shopify`;
  const topics = ["APP_UNINSTALLED", "SHOP_UPDATE"] as const;

  for (const topic of topics) {
    const result = await shopifyGraphQL<{
      webhookSubscriptionCreate: {
        webhookSubscription: { id: string; topic: string; callbackUrl: string } | null;
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(shop, accessToken, query, {
      topic,
      callbackUrl
    });

    if (result.webhookSubscriptionCreate.userErrors.length) {
      throw new Error(result.webhookSubscriptionCreate.userErrors.map((err) => err.message).join("; "));
    }
  }
}

export async function createMonthlySubscription(shop: string, accessToken: string, returnUrl: string): Promise<{ confirmationUrl: string; subscriptionId: string | null }> {
  return createRecurringSubscription(shop, accessToken, returnUrl, "monthly");
}

export type BillingCycle = "monthly" | "yearly";

export async function createRecurringSubscription(
  shop: string,
  accessToken: string,
  returnUrl: string,
  cycle: BillingCycle
): Promise<{ confirmationUrl: string; subscriptionId: string | null }> {
  const isYearly = cycle === "yearly";
  const mutation = `
    mutation CreateSubscription($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $trialDays: Int!) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        trialDays: $trialDays
        lineItems: $lineItems
      ) {
        confirmationUrl
        appSubscription { id }
        userErrors { field message }
      }
    }
  `;

  const result = await shopifyGraphQL<{
    appSubscriptionCreate: {
      confirmationUrl: string;
      appSubscription: { id: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(shop, accessToken, mutation, {
    name: isYearly ? "Checkout SaaS - $50/year" : "Checkout SaaS - $5/month",
    returnUrl,
    trialDays: appConfig.billingTrialDays,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: isYearly ? appConfig.billingYearlyAmount : appConfig.billingAmount,
              currencyCode: "USD"
            },
            interval: isYearly ? "ANNUAL" : "EVERY_30_DAYS"
          }
        }
      }
    ]
  });

  if (result.appSubscriptionCreate.userErrors.length) {
    throw new Error(result.appSubscriptionCreate.userErrors.map((err) => err.message).join("; "));
  }

  return {
    confirmationUrl: result.appSubscriptionCreate.confirmationUrl,
    subscriptionId: result.appSubscriptionCreate.appSubscription?.id ?? null
  };
}

export function isValidOAuthCallback(query: URLSearchParams, secret: string): boolean {
  return verifyQueryHmac(query, secret);
}
