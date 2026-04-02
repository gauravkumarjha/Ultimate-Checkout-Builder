import createApp from "@shopify/app-bridge";

export type AppBridgeState = {
  app: ReturnType<typeof createApp>;
  shop: string;
  host: string;
};

export function createAppBridgeState(): AppBridgeState | null {
  const params = new URLSearchParams(window.location.search);
  const shop = params.get("shop") ?? "";
  const host = params.get("host") ?? "";
  const apiKey = import.meta.env.VITE_SHOPIFY_API_KEY as string | undefined;

  if (!shop || !host || !apiKey) {
    return null;
  }

  return {
    shop,
    host,
    app: createApp({
      apiKey,
      host,
      forceRedirect: true
    })
  };
}
