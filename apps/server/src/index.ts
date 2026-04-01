import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { bootstrapDatabase } from "./db/bootstrap";
import { authRouter } from "./routes/auth";
import { apiRouter } from "./routes/api";
import { webhooksRouter } from "./routes/webhooks";

async function main(): Promise<void> {
  await bootstrapDatabase();

  const app = express();
  const allowedOrigins = new Set([env.APP_URL, "http://localhost:5173", "http://127.0.0.1:5173"]);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || origin.startsWith("http://localhost:")) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true
  }));
  app.use(cookieParser());
  app.use("/webhooks", express.raw({ type: "application/json" }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "shopify-checkout-saas" });
  });

  app.use("/auth", authRouter);
  app.use("/api", apiRouter);
  app.use("/webhooks", webhooksRouter);

  app.listen(env.PORT, () => {
    console.log(`Server listening on ${env.PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
