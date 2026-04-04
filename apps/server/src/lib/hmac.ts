import crypto from "crypto";

export function verifyQueryHmac(query: URLSearchParams, secret: string): boolean {
  const entries = Array.from(query.entries()).filter(([key]) => key !== "hmac" && key !== "signature");
  const message = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  const provided = query.get("hmac");
  if (!provided) {
    return false;
  }
  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(provided, "utf8");
  if (expected.length !== received.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, received);
}

export function verifyWebhookHmac(rawBody: Buffer, headerHmac: string | undefined, secret: string): boolean {
  if (!headerHmac) {
    return false;
  }
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const expected = Buffer.from(digest, "utf8");
  const received = Buffer.from(headerHmac, "utf8");
  if (expected.length !== received.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, received);
}

type OAuthStatePayload = {
  nonce: string;
  shop: string;
  host?: string;
  issuedAt: number;
};

export function createStateToken(shop: string, secret: string, host?: string): string {
  const payload: OAuthStatePayload = {
    nonce: crypto.randomBytes(16).toString("hex"),
    shop,
    host,
    issuedAt: Date.now()
  };

  const payloadEncoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payloadEncoded).digest("base64url");
  return `${payloadEncoded}.${signature}`;
}

export function verifyStateToken(token: string, secret: string, expectedShop: string): boolean {
  return readStateToken(token, secret, expectedShop) !== null;
}

export function readStateToken(token: string, secret: string, expectedShop: string): OAuthStatePayload | null {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return null;
  }

  const expectedSignature = crypto.createHmac("sha256", secret).update(payloadEncoded).digest("base64url");
  if (expectedSignature.length !== signature.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!payload.shop || payload.shop !== expectedShop) {
      return null;
    }

    const maxAgeMs = 10 * 60 * 1000;
    if (Date.now() - payload.issuedAt > maxAgeMs) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
