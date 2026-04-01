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

export function createStateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}
