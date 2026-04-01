import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { getShop } from "../db/repositories";

export type AuthedRequest = Request & {
  shopDomain?: string;
  shopRecord?: Awaited<ReturnType<typeof getShop>>;
  accessToken?: string | null;
};

export async function requireShopAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing session token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, env.SHOPIFY_API_SECRET, { algorithms: ["HS256"] }) as {
      dest?: string;
      iss?: string;
      sid?: string;
    };

    const source = decoded.dest ?? decoded.iss ?? "";
    const shopDomain = source.replace("https://", "").replace("/admin", "");
    const shopRecord = await getShop(shopDomain);
    if (!shopRecord) {
      res.status(404).json({ error: "Shop not installed" });
      return;
    }

    req.shopDomain = shopDomain;
    req.shopRecord = shopRecord;
    req.accessToken = shopRecord.access_token;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid session token" });
  }
}
