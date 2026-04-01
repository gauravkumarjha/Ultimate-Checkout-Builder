import { getSessionToken } from "@shopify/app-bridge-utils";
import type { AppBridgeState } from "./shopify";

export async function apiFetch(appBridge: AppBridgeState, input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getSessionToken(appBridge.app);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: "include"
  });
}
