# Shopify Checkout SaaS

Production-oriented monorepo for a multi-store Shopify app with:

- Node.js backend
- React admin dashboard
- Checkout UI extension
- MySQL persistence
- Shopify OAuth, webhook handling, and billing scaffolding

## Layout

- `packages/shared`: shared settings types and validation
- `apps/server`: Express API, OAuth, webhooks, billing, MySQL persistence, metafield sync
- `apps/admin`: embedded React admin UI
- `extensions/checkout-enhancements`: Checkout UI extension that renders merchant-configured modules

## Data model

The server bootstraps these PostgreSQL tables:

- `shops`
- `settings`
- `subscriptions`
- `webhook_events`

## Notes

- Payment method reordering is gated for Plus-supportable shops and uses a fallback display-only mode when Shopify restrictions apply.
- Custom CSS is treated as a safe merchant-facing config object. Checkout UI Extensions do not support arbitrary DOM/CSS injection, so the extension maps approved styling values instead of injecting raw CSS into checkout.
- The translation module supports manual language strings and JSON editor mode, with fallback to the default language when a key is missing.
- The admin UI is intentionally lightweight and form-based so it can be extended with richer component libraries later.

## Environment

See `.env.example` for the required variables.

## Local run

- `npm install`
- `npm run dev:server`
- `npm run dev:admin`
- Deploy or link the checkout extension with the Shopify CLI when you are ready to test it in a dev store.
