import React, {useEffect, useMemo, useRef, useState} from "react";
import {defaultCheckoutSettings, minutesToSeconds, type CheckoutSettings} from "@saas/shared";
import type {AppBridgeState} from "./lib/shopify";
import {apiFetch} from "./lib/api";

type LoadState = {
  error?: string;
  shop?: {shop_domain: string; shop_name: string; plan: string; is_active: boolean} | null;
  subscription?: {status: string; trial_ends_at: string | null; current_period_ends_at: string | null; billing_cycle?: string | null} | null;
  settings: CheckoutSettings;
  isBillingActive: boolean;
};

type SectionKey = "reviews" | "timer" | "fields" | "payments" | "css" | "translations";
type PageKey = "dashboard" | SectionKey;

const titles: Record<SectionKey, string> = {
  reviews: "Review Section",
  timer: "Countdown Timer",
  fields: "Custom Fields",
  payments: "Payment Ordering",
  css: "Custom CSS",
  translations: "Translations",
};

const navItems: Array<{key: PageKey; label: string; hint: string}> = [
  {key: "dashboard", label: "Dashboard", hint: "Overview"},
  {key: "reviews", label: "Reviews", hint: "Testimonials"},
  {key: "timer", label: "Timer", hint: "Urgency"},
  {key: "fields", label: "Fields", hint: "Inputs"},
  {key: "payments", label: "Payments", hint: "Ordering"},
  {key: "css", label: "CSS", hint: "Styles"},
  {key: "translations", label: "Translations", hint: "Locales"},
];

const createReview = () => ({id: crypto.randomUUID(), imageUrl: "https://picsum.photos/seed/review/400/240", customerName: "Customer name", starRating: 5, allowHalfStars: false, description: "Short customer testimonial goes here."});
const createField = (position: number) => ({id: crypto.randomUUID(), section: "shipping_address" as const, label: "Field label", type: "text" as const, required: false, position});

function normalizeForSave(settings: CheckoutSettings): CheckoutSettings {
  const next = structuredClone(settings);
  if (next.translations.mode === "json" && next.translations.jsonEditor.trim()) {
    next.translations.strings = JSON.parse(next.translations.jsonEditor) as CheckoutSettings["translations"]["strings"];
  }
  return next;
}

function cardEnabled(key: SectionKey, settings: CheckoutSettings) {
  return key === "reviews" ? settings.reviews.enabled
    : key === "timer" ? settings.timer.enabled
    : key === "fields" ? settings.customFields.enabled
    : key === "payments" ? settings.payments.enabled
    : key === "css" ? settings.css.enabled
    : settings.translations.enabled;
}

function PolarisCard({children, className = ""}: {children: React.ReactNode; className?: string}) {
  return <s-box className={`module ${className}`}>{children}</s-box>;
}

function FeatureCard({title, description, enabled, onClick}: {title: string; description: string; enabled: boolean; onClick: () => void;}) {
  return (
    <s-box className={`feature-tile ${enabled ? "feature-tile--on" : ""}`}>
      <button type="button" className="feature-tile__button" onClick={onClick}>
        <div className="feature-tile__top">
          <strong>{title}</strong>
          <span className="chip">{enabled ? "Enabled" : "Disabled"}</span>
        </div>
        <p className="muted">{description}</p>
      </button>
    </s-box>
  );
}

function SectionShell({title, subtitle, enabled, onToggle, children}: {title: string; subtitle: string; enabled: boolean; onToggle: () => void; children: React.ReactNode;}) {
  return (
    <PolarisCard>
      <s-block-stack gap="base">
        <s-inline-stack gap="base" block-alignment="center" inline-alignment="space-between">
          <s-block-stack gap="tight">
            <h3>{title}</h3>
            <s-text appearance="subdued">{subtitle}</s-text>
          </s-block-stack>
          <s-button onClick={onToggle}>{enabled ? "Disable" : "Enable"}</s-button>
        </s-inline-stack>
        {children}
      </s-block-stack>
    </PolarisCard>
  );
}

export function App({appBridgeState}: {appBridgeState: AppBridgeState | null}) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const shop = params.get("shop") ?? "";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [page, setPage] = useState<PageKey>("dashboard");
  const [data, setData] = useState<LoadState>({settings: defaultCheckoutSettings, isBillingActive: false});
  const refs = {reviews: useRef<HTMLDivElement | null>(null), timer: useRef<HTMLDivElement | null>(null), fields: useRef<HTMLDivElement | null>(null), payments: useRef<HTMLDivElement | null>(null), css: useRef<HTMLDivElement | null>(null), translations: useRef<HTMLDivElement | null>(null)};
  const setSettings = (next: CheckoutSettings) => setData((current) => ({...current, settings: next}));
  const openSection = (key: SectionKey) => { setPage(key); window.requestAnimationFrame(() => refs[key].current?.scrollIntoView({behavior: "smooth", block: "start"})); };

  useEffect(() => {
    if (!appBridgeState || !shop) { setLoading(false); return; }
    void (async () => {
      try {
        const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/settings`);
        const payload = (await response.json()) as LoadState;
        if (!response.ok) throw new Error(payload.error ?? `Load failed (${response.status})`);
        setData(payload);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load app state");
      } finally {
        setLoading(false);
      }
    })();
  }, [appBridgeState, shop]);

  const saveSettings = async () => {
    if (!appBridgeState || !shop) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/settings`, {method: "PUT", body: JSON.stringify(normalizeForSave(data.settings))});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Save failed (${response.status})`);
      setData((current) => ({...current, settings: payload.settings}));
      setMessage("Settings saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };

  const syncMetafields = async () => {
    if (!appBridgeState || !shop) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/sync`, {method: "POST"});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Sync failed (${response.status})`);
      setMessage("Synced to metafields.");
    } catch (e) { setError(e instanceof Error ? e.message : "Sync failed"); } finally { setSaving(false); }
  };

  const timerSeconds = minutesToSeconds(data.settings.timer.durationValue, data.settings.timer.durationUnit);
  const activeCount = [data.settings.reviews.enabled, data.settings.timer.enabled, data.settings.customFields.enabled, data.settings.payments.enabled, data.settings.css.enabled, data.settings.translations.enabled].filter(Boolean).length;
  const extensionState = activeCount > 0;

  if (loading) return <div className="shell"><PolarisCard><s-text>Loading app state...</s-text></PolarisCard></div>;
  if (!appBridgeState || !shop) return <div className="shell"><PolarisCard><s-block-stack gap="base"><s-text className="chip">Checkout SaaS Admin</s-text><h1 className="title">Open inside Shopify admin</h1><s-text appearance="subdued">Embedded session token and shop context are only available when the app opens from Shopify.</s-text></s-block-stack></PolarisCard></div>;

  return (
    <div className="shell stack">
      <PolarisCard className="preview-card stack">
        <s-inline-stack gap="base" block-alignment="center" inline-alignment="space-between">
          <s-block-stack gap="tight">
            <s-text className="chip chip--ok">Checkout Builder ECS</s-text>
            <h1 className="title">Welcome to your merchant dashboard.</h1>
            <s-text appearance="subdued">Manage features from cards, jump into each page, and keep checkout settings synced to the database.</s-text>
          </s-block-stack>
          <s-text className="chip">{page === "dashboard" ? "Dashboard" : titles[page as SectionKey]}</s-text>
        </s-inline-stack>
      </PolarisCard>

      <section className="nav-grid">
        {navItems.map((item) => (
          <s-box key={item.key} className={`nav-tile ${page === item.key ? "nav-tile--active" : ""}`}>
            <button type="button" className="nav-tile__button" onClick={() => { setPage(item.key); if (item.key === "dashboard") window.scrollTo({top: 0, behavior: "smooth"}); else openSection(item.key); }}>
              <strong>{item.label}</strong><span>{item.hint}</span>
            </button>
          </s-box>
        ))}
      </section>

      <section className="hero">
        <PolarisCard className="card-pad stack">
          <s-inline-stack gap="base" block-alignment="center" inline-alignment="space-between">
            <s-text className="chip">Multi-store checkout SaaS</s-text>
            <s-text className={`chip ${data.isBillingActive ? "chip--ok" : "chip--warn"}`}>{data.isBillingActive ? "Billing active" : "Billing inactive"}</s-text>
          </s-inline-stack>
          <h1 className="title">Configure checkout features from one merchant dashboard.</h1>
          <s-text appearance="subdued">Reviews, timer, custom fields, CSS, translations, and payment preferences live together in a single app, with each feature opening its own page section below.</s-text>
          <PolarisCard className="stack">
            <s-text as="strong">What lives where</s-text>
            <ul className="plain-list">{["Welcome dashboard manages settings, billing, and sync.","Checkout extension renders inside Shopify checkout editor.","Save settings here, then sync to metafields for the extension.","Use checkout editor to add the extension block after deploy."].map((item) => <li key={item}>{item}</li>)}</ul>
          </PolarisCard>
          <s-inline-stack gap="base" block-alignment="center" inline-alignment="start">
            <s-button onClick={saveSettings} disabled={saving}>Save to DB</s-button>
            <s-button onClick={syncMetafields} disabled={saving}>Sync to Checkout</s-button>
            {!data.isBillingActive ? <>
              <div className="field" style={{minWidth: 180}}><label>Billing cycle</label><select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as "monthly" | "yearly")}><option value="monthly">$5 / month</option><option value="yearly">$50 / year</option></select></div>
              <s-button disabled={saving} onClick={async () => { if (!appBridgeState || !shop) return; setSaving(true); setError(null); try { const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/billing`, {method: "POST", body: JSON.stringify({billingCycle})}); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? `Billing request failed (${response.status})`); window.location.href = payload.confirmationUrl; } catch (e) { setError(e instanceof Error ? e.message : "Billing flow failed"); setSaving(false); } }}>Activate {billingCycle === "yearly" ? "$50/year" : "$5/month"} plan</s-button>
            </> : <s-text className="chip chip--ok">Billing active</s-text>}
          </s-inline-stack>
          {error ? <s-banner status="critical" title="Something went wrong">{error}</s-banner> : null}
          {message ? <s-banner status="success" title="Saved">{message}</s-banner> : null}
        </PolarisCard>

        <PolarisCard className="card-pad stack">
          <h2>Store status</h2>
          <PolarisCard className="stack">
            <s-text as="strong">{data.shop?.shop_name ?? shop}</s-text>
            <s-text appearance="subdued">{data.shop?.shop_domain}</s-text>
            <div className="status-grid">
              <div>Plan: {data.shop?.plan ?? "unknown"}</div>
              <div>Subscription: {data.subscription?.status ?? "inactive"}</div>
              <div>Billing cycle: {data.subscription?.billing_cycle ?? billingCycle}</div>
              <div>Active modules: {activeCount}/6</div>
              <div>Extension state: {extensionState ? "Configured" : "Disabled"}</div>
            </div>
          </PolarisCard>
          <PolarisCard className="stack">
            <s-text as="strong">Checkout Extension</s-text>
            <s-text appearance="subdued">This app&apos;s checkout extension shows in Shopify&apos;s checkout editor, not as a normal widget inside the admin dashboard.</s-text>
            <s-text appearance="subdued">After <code>shopify app deploy</code>, open Shopify checkout editor and add the extension block there.</s-text>
          </PolarisCard>
        </PolarisCard>
      </section>

      <section className="module stack">
        <s-inline-stack gap="base" block-alignment="center" inline-alignment="space-between">
          <s-block-stack gap="tight"><h3>Feature Overview</h3><s-text appearance="subdued">Click any tile to jump into the section.</s-text></s-block-stack>
        </s-inline-stack>
        <div className="grid-3">{(Object.keys(titles) as SectionKey[]).map((key) => <FeatureCard key={key} title={titles[key]} description={titles[key] === "Review Section" ? "Testimonials and star ratings" : titles[key] === "Countdown Timer" ? "Urgency timer with reset modes" : titles[key] === "Custom Fields" ? "Shipping and billing inputs" : titles[key] === "Payment Ordering" ? "Plan-gated ordering preferences" : titles[key] === "Custom CSS" ? "Scoped styling controls" : "Manual strings and JSON editor"} enabled={cardEnabled(key, data.settings)} onClick={() => openSection(key)} />)}</div>
      </section>

      <div className="grid-2">
        <div ref={refs.reviews}>
          <SectionShell title="Review Section" subtitle="Testimonials, layout, autoplay, half-stars." enabled={data.settings.reviews.enabled} onToggle={() => setSettings({...data.settings, reviews: {...data.settings.reviews, enabled: !data.settings.reviews.enabled}})}>
            <div className="grid-2">
              <div className="field"><label>Layout</label><select value={data.settings.reviews.layout} onChange={(e) => setSettings({...data.settings, reviews: {...data.settings.reviews, layout: e.target.value as CheckoutSettings["reviews"]["layout"]}})}><option value="slider">Slider</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></div>
              <div className="field"><label>Speed (ms)</label><input type="number" min={1000} max={12000} value={data.settings.reviews.speedMs} onChange={(e) => setSettings({...data.settings, reviews: {...data.settings.reviews, speedMs: Number(e.target.value)}})} /></div>
            </div>
            <div className="row"><label className="toggle"><input type="checkbox" checked={data.settings.reviews.autoplay} onChange={(e) => setSettings({...data.settings, reviews: {...data.settings.reviews, autoplay: e.target.checked}})} /> Autoplay</label><label className="toggle"><input type="checkbox" checked={data.settings.reviews.allowHalfStars} onChange={(e) => setSettings({...data.settings, reviews: {...data.settings.reviews, allowHalfStars: e.target.checked}})} /> Half-stars</label></div>
            <PolarisCard className="stack"><s-text as="strong">Reviews</s-text><div className="stack" style={{marginTop: 12}}>{data.settings.reviews.reviews.slice(0, 3).map((r) => <div key={r.id} className="review-item"><s-text as="strong">{r.customerName}</s-text><s-text appearance="subdued">{r.description}</s-text></div>)}</div><s-button onClick={() => setSettings({...data.settings, reviews: {...data.settings.reviews, reviews: [...data.settings.reviews.reviews, createReview()]}})}>Add review</s-button></PolarisCard>
          </SectionShell>
        </div>
        <div ref={refs.timer}>
          <SectionShell title="Countdown Timer" subtitle="Duration, unit, and reset mode." enabled={data.settings.timer.enabled} onToggle={() => setSettings({...data.settings, timer: {...data.settings.timer, enabled: !data.settings.timer.enabled}})}>
            <div className="grid-2">
              <div className="field"><label>Duration</label><input type="number" min={1} value={data.settings.timer.durationValue} onChange={(e) => setSettings({...data.settings, timer: {...data.settings.timer, durationValue: Number(e.target.value)}})} /></div>
              <div className="field"><label>Unit</label><select value={data.settings.timer.durationUnit} onChange={(e) => setSettings({...data.settings, timer: {...data.settings.timer, durationUnit: e.target.value as "minutes" | "hours"}})}><option value="minutes">Minutes</option><option value="hours">Hours</option></select></div>
            </div>
            <div className="field"><label>Reset behavior</label><select value={data.settings.timer.resetBehavior} onChange={(e) => setSettings({...data.settings, timer: {...data.settings.timer, resetBehavior: e.target.value as "session" | "reload"}})}><option value="session">Per session</option><option value="reload">Per reload</option></select></div>
            <PolarisCard className="preview-card"><s-text appearance="subdued">Preview</s-text><div className="timer">{String(Math.floor(timerSeconds / 3600)).padStart(2, "0")}:{String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, "0")}:{String(timerSeconds % 60).padStart(2, "0")}</div></PolarisCard>
          </SectionShell>
        </div>
      </div>

      <div className="grid-2">
        <div ref={refs.fields}>
          <SectionShell title="Custom Fields" subtitle="Shipping / billing fields with positions." enabled={data.settings.customFields.enabled} onToggle={() => setSettings({...data.settings, customFields: {...data.settings.customFields, enabled: !data.settings.customFields.enabled}})}>
            <s-button onClick={() => setSettings({...data.settings, customFields: {...data.settings.customFields, fields: [...data.settings.customFields.fields, createField(data.settings.customFields.fields.length + 1)]}})}>Add field</s-button>
            <div className="stack">{data.settings.customFields.fields.slice(0, 3).map((f) => <PolarisCard key={f.id} className="stack"><s-inline-stack gap="base" block-alignment="center" inline-alignment="space-between"><s-text as="strong">{f.label}</s-text><s-button onClick={() => setSettings({...data.settings, customFields: {...data.settings.customFields, fields: data.settings.customFields.fields.filter((x) => x.id !== f.id)}})}>Delete</s-button></s-inline-stack><s-text appearance="subdued">{f.section} / {f.type} / position {f.position}</s-text></PolarisCard>)}</div>
          </SectionShell>
        </div>
        <div ref={refs.payments}>
          <SectionShell title="Payment Ordering" subtitle="Plan-gated ordering with fallback." enabled={data.settings.payments.enabled} onToggle={() => setSettings({...data.settings, payments: {...data.settings.payments, enabled: !data.settings.payments.enabled}})}>
            <div className="grid-2">
              <div className="field"><label>Fallback mode</label><select value={data.settings.payments.fallbackMode} onChange={(e) => setSettings({...data.settings, payments: {...data.settings.payments, fallbackMode: e.target.value as "display_only" | "shopify_native"}})}><option value="display_only">Display only</option><option value="shopify_native">Shopify native</option></select></div>
              <div className="field"><label>Priority order</label><input type="text" value={data.settings.payments.priorityOrder.join(",")} onChange={(e) => setSettings({...data.settings, payments: {...data.settings.payments, priorityOrder: e.target.value.split(",").map((i) => i.trim()).filter(Boolean)}})} placeholder="card,paypal,shop_pay" /></div>
            </div>
          </SectionShell>
        </div>
      </div>

      <div className="grid-2">
        <div ref={refs.css}>
          <SectionShell title="Custom CSS" subtitle="Scoped styling per module." enabled={data.settings.css.enabled} onToggle={() => setSettings({...data.settings, css: {...data.settings.css, enabled: !data.settings.css.enabled}})}>
            {data.settings.css.enabled ? <>
              <div className="field"><label>Scope</label><select value={data.settings.css.scope} onChange={(e) => setSettings({...data.settings, css: {...data.settings.css, scope: e.target.value as CheckoutSettings["css"]["scope"]}})}><option value="all">All modules</option><option value="review_section">Review section</option><option value="timer">Timer</option><option value="custom_fields">Custom fields</option></select></div>
              <div className="field"><label>CSS</label><textarea value={data.settings.css.customCss} onChange={(e) => setSettings({...data.settings, css: {...data.settings.css, customCss: e.target.value}})} /></div>
            </> : <s-text appearance="subdued">Enable the toggle to edit CSS.</s-text>}
          </SectionShell>
        </div>
        <div ref={refs.translations}>
          <SectionShell title="Translations" subtitle="Manual strings or JSON editor." enabled={data.settings.translations.enabled} onToggle={() => setSettings({...data.settings, translations: {...data.settings.translations, enabled: !data.settings.translations.enabled}})}>
            <div className="grid-2">
              <div className="field"><label>Default language</label><input type="text" value={data.settings.translations.defaultLanguage} onChange={(e) => setSettings({...data.settings, translations: {...data.settings.translations, defaultLanguage: e.target.value}})} /></div>
              <div className="field"><label>Languages</label><input type="text" value={data.settings.translations.languages.join(",")} onChange={(e) => setSettings({...data.settings, translations: {...data.settings.translations, languages: e.target.value.split(",").map((i) => i.trim()).filter(Boolean)}})} /></div>
            </div>
            <div className="field"><label>Mode</label><select value={data.settings.translations.mode} onChange={(e) => setSettings({...data.settings, translations: {...data.settings.translations, mode: e.target.value as "manual" | "json"}})}><option value="manual">Manual</option><option value="json">JSON editor</option></select></div>
            {data.settings.translations.mode === "json" ? <div className="field"><label>JSON editor</label><textarea value={data.settings.translations.jsonEditor} onChange={(e) => setSettings({...data.settings, translations: {...data.settings.translations, jsonEditor: e.target.value}})} /></div> : <PolarisCard><s-text as="strong">Manual translation keys</s-text><s-text appearance="subdued">review_title, timer_text, countdown_label, button_text, section_heading</s-text></PolarisCard>}
          </SectionShell>
        </div>
      </div>
    </div>
  );
}
