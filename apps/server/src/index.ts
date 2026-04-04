import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { bootstrapDatabase } from "./db/bootstrap";
import { getSettings, getShop, getSubscription, upsertSettings } from "./db/repositories";
import { pool, select } from "./db/client";
import { authRouter } from "./routes/auth";
import { apiRouter } from "./routes/api";
import { webhooksRouter } from "./routes/webhooks";
import { createStateToken, verifyStateToken } from "./lib/hmac";
import { syncFrontendMetafield } from "./services/metafields";
import { isBillingActive } from "./services/billing";

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
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function boolLabel(value: boolean): string {
    return value ? "Enabled" : "Disabled";
  }

  function noticeMarkup(type: "success" | "error" | "info", message: string): string {
    const toneClass = type === "success" ? "notice--success" : type === "error" ? "notice--error" : "notice--info";
    return `<div class="notice ${toneClass}">${escapeHtml(message)}</div>`;
  }

  app.get("/proxy", (req, res) => {
    const shop = typeof req.query.shop === "string" ? req.query.shop.trim() : "";
    res.type("html").send(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Checkout Builder Proxy</title>
          <style>
            body { margin:0; min-height:100vh; display:grid; place-items:center; background:linear-gradient(180deg,#fcfaf6 0%,#f4efe7 100%); color:#1f1a17; font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
            .card { width:min(760px, calc(100vw - 32px)); background:#fff; border:1px solid rgba(31,26,23,.12); border-radius:24px; padding:28px; box-shadow:0 22px 60px rgba(31,26,23,.12); }
            h1 { margin:0 0 12px; font-size:clamp(32px, 4vw, 56px); line-height:1.02; letter-spacing:-.05em; }
            p { margin:0; color:#6f665c; line-height:1.7; font-size:16px; }
            code { background:#f4efe7; padding:2px 6px; border-radius:6px; }
          </style>
        </head>
        <body>
          <main class="card">
            <h1>App Proxy is live</h1>
            <p>Storefront proxy is configured for <code>/apps/checkout-builder-3</code> and served from <code>/proxy</code>. ${shop ? `Shop: <code>${escapeHtml(shop)}</code>` : ""}</p>
          </main>
        </body>
      </html>`);
  });

  async function getTableCount(tableName: "shops" | "settings" | "subscriptions"): Promise<number> {
    const rows = await select<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName}`);
    return rows[0]?.count ?? 0;
  }

  function renderDashboardPage(input: {
    shopDomain: string;
    host: string;
    shopName: string;
    plan: string;
    isActive: boolean;
    subscriptionStatus: string;
    billingCycle: string;
    billingActive: boolean;
    settings: Awaited<ReturnType<typeof getSettings>>;
    actionToken: string;
    notice?: { type: "success" | "error" | "info"; message: string } | null;
  }): string {
    const {
      shopDomain,
      host,
      shopName,
      plan,
      isActive,
      subscriptionStatus,
      billingCycle,
      billingActive,
      settings,
      actionToken,
      notice
    } = input;

    const modules = [
      { key: "reviews", title: "Review Section", enabled: settings.reviews.enabled, detail: `${settings.reviews.layout} layout, ${settings.reviews.reviews.length} review(s), autoplay ${boolLabel(settings.reviews.autoplay)}.` },
      { key: "timer", title: "Countdown Timer", enabled: settings.timer.enabled, detail: `${settings.timer.durationValue} ${settings.timer.durationUnit}, reset ${settings.timer.resetBehavior}.` },
      { key: "fields", title: "Custom Fields", enabled: settings.customFields.enabled, detail: `${settings.customFields.fields.length} configured field(s) for shipping and billing.` },
      { key: "payments", title: "Payment Ordering", enabled: settings.payments.enabled, detail: `${settings.payments.fallbackMode} fallback, ${settings.payments.priorityOrder.length} priority item(s).` },
      { key: "css", title: "Custom CSS", enabled: settings.css.enabled, detail: `Scope: ${settings.css.scope}.` },
      { key: "translations", title: "Translations", enabled: settings.translations.enabled, detail: `${settings.translations.languages.join(", ") || "no languages"}; default ${settings.translations.defaultLanguage}.` }
    ];

    const moduleCards = modules
      .map(
        (module) => `
          <article class="tile ${module.enabled ? "tile--on" : ""}" id="${module.key}">
            <div class="tile__head">
              <strong>${module.title}</strong>
              <form method="post" action="/ui/shops/${encodeURIComponent(shopDomain)}/features/${module.key}/toggle" class="inline-form">
                <input type="hidden" name="actionToken" value="${escapeHtml(actionToken)}" />
                <input type="hidden" name="enabled" value="${module.enabled ? "false" : "true"}" />
                <input type="hidden" name="host" value="${escapeHtml(host)}" />
                <button class="chip ${module.enabled ? "chip--ok" : "chip--warn"}" type="submit">${module.enabled ? "Disable" : "Enable"}</button>
              </form>
            </div>
            <p>${module.detail}</p>
          </article>`
      )
      .join("");

    const reviewItems = settings.reviews.reviews
      .map(
        (review, index) => `
          <div class="review-card">
            <img src="${escapeHtml(review.imageUrl)}" alt="${escapeHtml(review.customerName)}" />
            <strong>#${index + 1} ${escapeHtml(review.customerName)}</strong>
            <div class="stars">${"★".repeat(Math.round(review.starRating))}${"☆".repeat(5 - Math.round(review.starRating))}</div>
            <p>${escapeHtml(review.description)}</p>
          </div>`
      )
      .join("");

    const fieldItems = settings.customFields.fields
      .map(
        (field) => `
          <li>
            <strong>${escapeHtml(field.label)}</strong>
            <span>${escapeHtml(field.section)} · ${escapeHtml(field.type)} · position ${field.position} · ${field.required ? "required" : "optional"}</span>
          </li>`
      )
      .join("");

    const translationSummary = settings.translations.mode === "json" && settings.translations.jsonEditor.trim()
      ? escapeHtml(settings.translations.jsonEditor)
      : JSON.stringify(settings.translations.strings, null, 2);
    const timerTotalSeconds = settings.timer.durationValue * (settings.timer.durationUnit === "hours" ? 3600 : 60);
    const timerDisplay = `${String(Math.floor(timerTotalSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((timerTotalSeconds % 3600) / 60)).padStart(2, "0")}:00`;

    return `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Ultimate Checkout Builder</title>
          <style>
            :root { color-scheme: light; --bg:#f4efe7; --panel:rgba(255,255,255,.9); --text:#1f1a17; --muted:#6f665c; --accent:#1f7a65; --warn:#c36d3d; --border:rgba(31,26,23,.12); --shadow:0 22px 60px rgba(31,26,23,.12); }
            * { box-sizing: border-box; }
            body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--text); background:linear-gradient(180deg,#fcfaf6 0%,var(--bg) 100%); }
            .shell { max-width:1440px; margin:0 auto; padding:28px; }
            .hero { display:grid; grid-template-columns:1.2fr .8fr; gap:20px; margin-bottom:20px; }
            .card { background:var(--panel); border:1px solid var(--border); border-radius:24px; box-shadow:var(--shadow); padding:24px; }
            .stack { display:grid; gap:16px; }
            .title { margin:0 0 8px; font-size:clamp(34px,4.6vw,62px); line-height:1.02; letter-spacing:-.05em; font-weight:800; }
            .muted { color:var(--muted); }
            .chip { display:inline-flex; align-items:center; gap:8px; border:0; border-radius:999px; padding:8px 12px; background:rgba(31,122,101,.1); color:var(--accent); font-size:13px; font:inherit; cursor:pointer; font-weight:700; }
            .chip--ok { background:rgba(31,122,101,.14); color:var(--accent); }
            .chip--warn { background:rgba(195,109,61,.14); color:var(--warn); }
            .top { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
            .row { display:flex; flex-wrap:wrap; gap:12px; }
            .btn { border:0; border-radius:999px; padding:11px 16px; background:var(--text); color:#fff; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
            .btn.secondary { background:#fff; color:var(--text); border:1px solid var(--border); }
            .btn.action { cursor:pointer; font:inherit; }
            .grid-3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }
            .grid-2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
            .tile, .panel, .review-card { background:#fff; border:1px solid var(--border); border-radius:18px; padding:16px; }
            .tile--on { background:linear-gradient(180deg, rgba(31,122,101,.08), rgba(255,255,255,.95)); }
            .tile__head { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-bottom:10px; }
            .inline-form { margin:0; }
            .section-title { margin:0; font-size:20px; font-weight:800; letter-spacing:-.02em; }
            .plain-list { margin:0; padding-left:18px; color:var(--muted); display:grid; gap:8px; }
            .review-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; }
            .review-card img { width:100%; height:120px; object-fit:cover; border-radius:12px; margin-bottom:10px; }
            .review-card p, .tile p { margin:8px 0 0; color:var(--muted); line-height:1.5; }
            .stars { color:#b45309; letter-spacing:1px; margin:6px 0; }
            .preview-code { white-space:pre-wrap; background:#0f172a; color:#e2e8f0; border-radius:16px; padding:16px; overflow:auto; }
            .list { margin:0; padding-left:18px; color:var(--muted); display:grid; gap:8px; }
            .footer-note { color:var(--muted); font-size:13px; }
            .notice { border-radius:16px; padding:14px 16px; font-weight:600; border:1px solid transparent; }
            .notice--success { background:rgba(31,122,101,.12); color:#0f5d4d; border-color:rgba(31,122,101,.18); }
            .notice--error { background:rgba(185,28,28,.1); color:#991b1b; border-color:rgba(185,28,28,.18); }
            .notice--info { background:rgba(37,99,235,.1); color:#1e40af; border-color:rgba(37,99,235,.18); }
            @media (max-width: 1100px) { .hero, .grid-3, .grid-2 { grid-template-columns:1fr; } }
          </style>
        </head>
        <body>
          <main class="shell stack">
            <section class="hero">
              <div class="card stack">
                <div class="top">
                  <span class="chip">Multi-store checkout SaaS</span>
                  <span class="chip ${billingActive ? "chip--ok" : "chip--warn"}">${billingActive ? "Billing active" : "Billing inactive"}</span>
                </div>
                <h1 class="title">Merchant dashboard for checkout features.</h1>
                <p class="muted">This page is rendered directly by the server so the Shopify app opens here even when the separate dev UI is not running.</p>
                <div class="panel stack">
                  <strong>What lives where</strong>
                  <ul class="plain-list">
                    <li>Dashboard, billing, and sync live here.</li>
                    <li>Checkout extension renders in Shopify checkout editor.</li>
                    <li>Save settings here, then sync to metafields for checkout.</li>
                    <li>Use the checkout editor to add the extension block after deploy.</li>
                  </ul>
                </div>
                ${notice ? noticeMarkup(notice.type, notice.message) : ""}
                <div class="row">
                  <a class="btn" href="/auth?shop=${encodeURIComponent(shopDomain)}">Reconnect Store</a>
                  <form method="post" action="/ui/shops/${encodeURIComponent(shopDomain)}/sync" class="inline-form">
                    <input type="hidden" name="actionToken" value="${escapeHtml(actionToken)}" />
                    <input type="hidden" name="host" value="${escapeHtml(host)}" />
                    <button class="btn secondary action" type="submit">Sync Checkout</button>
                  </form>
                  <a class="btn secondary" href="/health">Server Health</a>
                </div>
              </div>
              <div class="card stack">
                <div class="section-title">Store status</div>
                <div class="panel stack">
                  <div><strong>${escapeHtml(shopName || shopDomain)}</strong></div>
                  <div class="muted">${escapeHtml(shopDomain)}</div>
                  <div>Plan: ${escapeHtml(plan)}</div>
                  <div>Active: ${isActive ? "Yes" : "No"}</div>
                  <div>Subscription: ${escapeHtml(subscriptionStatus)}</div>
                  <div>Billing cycle: ${escapeHtml(billingCycle)}</div>
                </div>
                <div class="panel stack">
                  <strong>Checkout Extension</strong>
                  <p class="muted" style="margin:0;">This extension is added in the Shopify Checkout Editor. In this dashboard you configure it, enable it, and sync its data.</p>
                  <p class="muted" style="margin:0;">Shopify URL context: <code>${escapeHtml(shopDomain)}</code></p>
                  <p class="footer-note" style="margin:0;">Host: ${escapeHtml(host)}</p>
                  <p class="footer-note" style="margin:0;">App proxy: <code>/apps/checkout-builder-3</code> via <code>/proxy</code></p>
                </div>
              </div>
            </section>

            <section class="card stack">
              <div class="top">
                <div>
                  <h2 class="section-title" style="margin:0;">Feature overview</h2>
                  <p class="muted" style="margin:6px 0 0;">Click a section below to review the current configuration state.</p>
                </div>
                <div class="chip">${modules.filter((item) => item.enabled).length}/6 enabled</div>
              </div>
              <div class="grid-3">${moduleCards}</div>
            </section>

            <div class="grid-2">
              <section class="card stack" id="reviews">
                <div class="top">
                  <div>
                    <h3 class="section-title">Review Section</h3>
                    <p class="muted">Layout: ${escapeHtml(settings.reviews.layout)} · Autoplay: ${settings.reviews.autoplay ? "On" : "Off"} · Half-stars: ${settings.reviews.allowHalfStars ? "Yes" : "No"}</p>
                  </div>
                  <span class="chip ${settings.reviews.enabled ? "chip--ok" : "chip--warn"}">${boolLabel(settings.reviews.enabled)}</span>
                </div>
                <div class="review-grid">${reviewItems || "<div class='muted'>No reviews configured yet.</div>"}</div>
              </section>

              <section class="card stack" id="timer">
                <div class="top">
                  <div>
                    <h3 class="section-title">Countdown Timer</h3>
                    <p class="muted">Format: HH:MM:SS · Reset: ${escapeHtml(settings.timer.resetBehavior)}</p>
                  </div>
                  <span class="chip ${settings.timer.enabled ? "chip--ok" : "chip--warn"}">${boolLabel(settings.timer.enabled)}</span>
                </div>
                <div class="panel"><strong>${timerDisplay}</strong></div>
              </section>
            </div>

            <div class="grid-2">
              <section class="card stack" id="fields">
                <div class="top">
                  <div>
                    <h3 class="section-title">Custom Checkout Fields</h3>
                    <p class="muted">Shipping and billing fields are listed below.</p>
                  </div>
                  <span class="chip ${settings.customFields.enabled ? "chip--ok" : "chip--warn"}">${boolLabel(settings.customFields.enabled)}</span>
                </div>
                <ul class="list">${fieldItems || "<li class='muted'>No fields configured yet.</li>"}</ul>
              </section>

              <section class="card stack" id="payments">
                <div class="top">
                  <div>
                    <h3 class="section-title">Payment Method Ordering</h3>
                    <p class="muted">Fallback: ${escapeHtml(settings.payments.fallbackMode)} · Plus only: ${settings.payments.plusOnly ? "Yes" : "No"}</p>
                  </div>
                  <span class="chip ${settings.payments.enabled ? "chip--ok" : "chip--warn"}">${boolLabel(settings.payments.enabled)}</span>
                </div>
                <div class="panel">
                  <div>Priority order: ${settings.payments.priorityOrder.length ? escapeHtml(settings.payments.priorityOrder.join(", ")) : "none"}</div>
                  <div>Enabled methods: ${settings.payments.enabledMethods.length ? escapeHtml(settings.payments.enabledMethods.join(", ")) : "none"}</div>
                  <div>Disabled methods: ${settings.payments.disabledMethods.length ? escapeHtml(settings.payments.disabledMethods.join(", ")) : "none"}</div>
                </div>
              </section>
            </div>

            <div class="grid-2">
              <section class="card stack" id="css">
                <div class="top">
                  <div>
                    <h3 class="section-title">Custom CSS</h3>
                    <p class="muted">Scope: ${escapeHtml(settings.css.scope)}.</p>
                  </div>
                  <span class="chip ${settings.css.enabled ? "chip--ok" : "chip--warn"}">${boolLabel(settings.css.enabled)}</span>
                </div>
                <div class="panel"><pre class="preview-code">${escapeHtml(settings.css.customCss || "/* No custom CSS configured */")}</pre></div>
              </section>

              <section class="card stack" id="translations">
                <div class="top">
                  <div>
                    <h3 class="section-title">Translations</h3>
                    <p class="muted">Default language: ${escapeHtml(settings.translations.defaultLanguage)} · Languages: ${escapeHtml(settings.translations.languages.join(", "))}</p>
                  </div>
                  <span class="chip ${settings.translations.enabled ? "chip--ok" : "chip--warn"}">${boolLabel(settings.translations.enabled)}</span>
                </div>
                <div class="panel"><pre class="preview-code">${translationSummary}</pre></div>
              </section>
            </div>
          </main>
        </body>
      </html>`;
  }

  app.get("/", async (req, res, next) => {
    const shop = typeof req.query.shop === "string" ? req.query.shop.trim() : "";
    const host = typeof req.query.host === "string" ? req.query.host.trim() : "";
    const saved = typeof req.query.saved === "string" ? req.query.saved.trim() : "";
    const synced = typeof req.query.synced === "string" ? req.query.synced.trim() : "";
    const error = typeof req.query.error === "string" ? req.query.error.trim() : "";

    if (shop) {
      const shopRecord = await getShop(shop);
      if (!shopRecord?.access_token) {
        const params = new URLSearchParams({ shop });
        if (host) {
          params.set("host", host);
        }
        res.redirect(`/auth?${params.toString()}`);
        return;
      }

      const settings = await getSettings(shop);
      const subscription = await getSubscription(shop);
      const actionToken = createStateToken(shop, env.SHOPIFY_API_SECRET);
      res.type("html").send(renderDashboardPage({
        shopDomain: shop,
        host,
        shopName: shopRecord?.shop_name ?? shop,
        plan: shopRecord?.plan ?? "unknown",
        isActive: Boolean(shopRecord?.is_active),
        subscriptionStatus: subscription?.status ?? "inactive",
        billingCycle: subscription?.billing_cycle ?? "monthly",
        billingActive: Boolean(subscription && ["active", "trial", "trialing"].includes(subscription.status)),
        settings,
        actionToken,
        notice: error
          ? { type: "error", message: error }
          : synced
            ? { type: "success", message: "Checkout data synced successfully." }
            : saved
              ? { type: "success", message: `Saved ${saved} successfully.` }
              : null
      }));
      return;
    }

    res.type("html").send(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Ultimate Checkout Builder</title>
          <style>
            body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #f7f3ee, #fff); color: #1f1a17; }
            .card { width: min(760px, calc(100vw - 32px)); background: #fff; border: 1px solid #ddd; border-radius: 20px; padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,.08); }
            h1 { margin: 0 0 12px; font-size: clamp(32px, 4vw, 56px); line-height: 1.05; letter-spacing: -0.05em; font-weight: 800; }
            p { line-height: 1.6; color: #6f665c; }
            form { display: grid; gap: 12px; margin-top: 18px; }
            input, button { font: inherit; padding: 12px 14px; border-radius: 12px; border: 1px solid #ccc; }
            button { background: #1f7a65; color: white; border: 0; cursor: pointer; }
            code { background: #f4efe7; padding: 2px 6px; border-radius: 6px; }
          </style>
        </head>
        <body>
          <main class="card">
            <h1>Ultimate Checkout Builder</h1>
            <p>This app configures checkout features for Shopify stores. To install or open the embedded app, enter your <code>myshopify.com</code> domain below.</p>
            <form action="/auth" method="get">
              <input name="shop" placeholder="your-store.myshopify.com" autocomplete="off" />
              <button type="submit">Connect Shopify Store</button>
            </form>
          </main>
        </body>
      </html>`);
  });

  app.get("/health", async (_req, res) => {
    try {
      const [dbPing] = await pool.query("SELECT 1 AS ok");
      const shopCount = await getTableCount("shops");
      const settingsCount = await getTableCount("settings");
      const subscriptionCount = await getTableCount("subscriptions");

      res.json({
        ok: true,
        service: "shopify-checkout-saas",
        database: {
          connected: true,
          ping: Array.isArray(dbPing) ? dbPing : [],
          shops: shopCount,
          settings: settingsCount,
          subscriptions: subscriptionCount
        }
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        service: "shopify-checkout-saas",
        database: {
          connected: false,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  });

  app.post("/ui/shops/:shop/features/:feature/toggle", async (req, res) => {
    const shop = String(req.params.shop ?? "").trim().toLowerCase();
    const feature = String(req.params.feature ?? "").trim();
    const actionToken = String(req.body?.actionToken ?? "").trim();
    const enabled = String(req.body?.enabled ?? "false") === "true";
    const host = String(req.body?.host ?? "").trim();

    if (!shop || !feature || !verifyStateToken(actionToken, env.SHOPIFY_API_SECRET, shop)) {
      res.status(400).send("Invalid action token");
      return;
    }

    const shopRecord = await getShop(shop);
    if (!shopRecord?.access_token) {
      const params = new URLSearchParams({ shop });
      if (host) params.set("host", host);
      res.redirect(`/auth?${params.toString()}`);
      return;
    }

    if (!(await isBillingActive(shop))) {
      res.status(402).send("Subscription inactive");
      return;
    }

    const settings = await getSettings(shop);
    switch (feature) {
      case "reviews":
        settings.reviews.enabled = enabled;
        break;
      case "timer":
        settings.timer.enabled = enabled;
        break;
      case "fields":
        settings.customFields.enabled = enabled;
        break;
      case "payments":
        settings.payments.enabled = enabled;
        if (!/plus/i.test(shopRecord.plan)) {
          settings.payments.enabled = false;
          settings.payments.fallbackMode = "display_only";
        }
        break;
      case "css":
        settings.css.enabled = enabled;
        break;
      case "translations":
        settings.translations.enabled = enabled;
        break;
      default:
        res.status(400).send("Unknown feature");
        return;
    }

    await upsertSettings(shop, settings);
    await syncFrontendMetafield(shop, shopRecord.access_token, settings, /plus/i.test(shopRecord.plan));

    const params = new URLSearchParams({ shop });
    if (host) params.set("host", host);
    params.set("saved", feature);
    res.redirect(`/?${params.toString()}`);
  });

  app.post("/ui/shops/:shop/sync", async (req, res) => {
    const shop = String(req.params.shop ?? "").trim().toLowerCase();
    const actionToken = String(req.body?.actionToken ?? "").trim();
    const host = String(req.body?.host ?? "").trim();

    if (!shop || !verifyStateToken(actionToken, env.SHOPIFY_API_SECRET, shop)) {
      res.status(400).send("Invalid action token");
      return;
    }

    const shopRecord = await getShop(shop);
    if (!shopRecord?.access_token) {
      const params = new URLSearchParams({ shop });
      if (host) params.set("host", host);
      res.redirect(`/auth?${params.toString()}`);
      return;
    }

    if (!(await isBillingActive(shop))) {
      res.status(402).send("Subscription inactive");
      return;
    }

    try {
      const settings = await getSettings(shop);
      await syncFrontendMetafield(shop, shopRecord.access_token, settings, /plus/i.test(shopRecord.plan));

      const params = new URLSearchParams({ shop });
      if (host) params.set("host", host);
      params.set("synced", "1");
      res.redirect(`/?${params.toString()}`);
    } catch (error) {
      const params = new URLSearchParams({ shop });
      if (host) params.set("host", host);
      params.set("error", error instanceof Error ? error.message : String(error));
      res.redirect(`/?${params.toString()}`);
    }
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
