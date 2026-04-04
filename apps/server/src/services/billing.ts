import { env } from "../config/env";
import { createRecurringSubscription, shopifyGraphQL, type BillingCycle } from "../lib/shopify";
import { getSubscription, upsertSubscription } from "../db/repositories";

export async function startBillingFlow(
  shop: string,
  accessToken: string,
  returnUrl: string,
  billingCycle: BillingCycle = "monthly"
): Promise<{ confirmationUrl: string }> {
  const { confirmationUrl, subscriptionId } = await createRecurringSubscription(shop, accessToken, returnUrl, billingCycle);
  await upsertSubscription({
    shopDomain: shop,
    chargeId: subscriptionId,
    status: "trial",
    confirmationUrl,
    trialEnd: new Date(Date.now() + env.BILLING_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    billingCycle
  });
  return { confirmationUrl };
}

export async function reconcileBilling(shop: string, accessToken: string): Promise<void> {
  const query = `
    query CurrentSubscriptions {
      currentAppInstallation {
        activeSubscriptions {
          id
          status
          currentPeriodEnd
        }
      }
    }
  `;

  const result = await shopifyGraphQL<{
    currentAppInstallation: {
      activeSubscriptions: Array<{ id: string; status: string; currentPeriodEnd: string | null }>;
    };
  }>(shop, accessToken, query);

  const active = result.currentAppInstallation.activeSubscriptions[0];
  if (!active) {
    await upsertSubscription({
      shopDomain: shop,
      status: "cancelled",
      billingCycle: "monthly"
    });
    return;
  }

  await upsertSubscription({
    shopDomain: shop,
    chargeId: active.id,
    status: active.status.toLowerCase() === "active" ? "active" : "trial",
    billingCycle: "monthly",
    trialEnd: active.currentPeriodEnd
  });
}

export async function isBillingActive(shop: string): Promise<boolean> {
  const subscription = await getSubscription(shop);
  if (!subscription) {
    return false;
  }
  return ["active", "trialing", "trial"].includes(subscription.status);
}
