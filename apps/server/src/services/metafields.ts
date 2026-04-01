import { buildFrontendConfig, CheckoutSettings } from "@saas/shared";
import { shopifyGraphQL } from "../lib/shopify";

export async function syncFrontendMetafield(shop: string, accessToken: string, settings: CheckoutSettings, isPlusShop: boolean): Promise<void> {
  const payload = buildFrontendConfig(settings, isPlusShop);
  const installation = await shopifyGraphQL<{
    currentAppInstallation: {
      id: string;
    };
  }>(shop, accessToken, `
    query CurrentInstallation {
      currentAppInstallation {
        id
      }
    }
  `);

  const mutation = `
    mutation SetAppMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value type }
        userErrors { field message }
      }
    }
  `;

  const result = await shopifyGraphQL<{
    metafieldsSet: {
      metafields: Array<{ id: string; namespace: string; key: string; value: string; type: string }>;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(shop, accessToken, mutation, {
    metafields: [
      {
        namespace: "checkout_saas",
        key: "config",
        ownerId: installation.currentAppInstallation.id,
        type: "json",
        value: JSON.stringify(payload)
      }
    ]
  });

  if (result.metafieldsSet.userErrors.length) {
    throw new Error(result.metafieldsSet.userErrors.map((err) => err.message).join("; "));
  }
}
