import React, { useEffect, useMemo, useRef, useState } from "react";
import { defaultCheckoutSettings, minutesToSeconds, type CheckoutSettings } from "@saas/shared";
import type { AppBridgeState } from "./lib/shopify";
import { apiFetch } from "./lib/api";

type LoadState = {
  error?: string;
  shop?: { shop_domain: string; shop_name: string; plan: string; is_active: boolean } | null;
  subscription?: { status: string; trial_ends_at: string | null; current_period_ends_at: string | null; billing_cycle?: string | null } | null;
  settings: CheckoutSettings;
  isBillingActive: boolean;
};

type SectionKey = "reviews" | "timer" | "fields" | "payments" | "css" | "translations";
const titles: Record<SectionKey, string> = {
  reviews: "Review Section",
  timer: "Countdown Timer",
  fields: "Custom Fields",
  payments: "Payment Ordering",
  css: "Custom CSS",
  translations: "Translations"
};
const desc: Record<SectionKey, string> = {
  reviews: "Testimonials and star ratings",
  timer: "Urgency timer with reset modes",
  fields: "Shipping and billing inputs",
  payments: "Plan-gated ordering preferences",
  css: "Scoped styling controls",
  translations: "Manual strings and JSON editor"
};

const stepItems = [
  "App dashboard manages settings, billing, and sync.",
  "Checkout extension renders inside Shopify checkout editor.",
  "Save settings here, then sync to metafields for the extension.",
  "Use checkout editor to add the extension block after deploy."
];

const createReview = () => ({
  id: crypto.randomUUID(),
  imageUrl: "https://picsum.photos/seed/review/400/240",
  customerName: "Customer name",
  starRating: 5,
  allowHalfStars: false,
  description: "Short customer testimonial goes here."
});

const createField = (position: number) => ({
  id: crypto.randomUUID(),
  section: "shipping_address" as const,
  label: "Field label",
  type: "text" as const,
  required: false,
  position
});

function normalizeForSave(settings: CheckoutSettings): CheckoutSettings {
  const next = structuredClone(settings);
  if (next.translations.mode === "json" && next.translations.jsonEditor.trim()) {
    next.translations.strings = JSON.parse(next.translations.jsonEditor) as CheckoutSettings["translations"]["strings"];
  }
  return next;
}

function CardButton({ title, description, enabled, onClick }: { title: string; description: string; enabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`feature-tile ${enabled ? "feature-tile--on" : ""}`} onClick={onClick}>
      <div className="feature-tile__top">
        <strong>{title}</strong>
        <span className="chip">{enabled ? "Enabled" : "Disabled"}</span>
      </div>
      <p className="muted">{description}</p>
    </button>
  );
}

export function App({ appBridgeState }: { appBridgeState: AppBridgeState | null }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const shop = params.get("shop") ?? "";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [data, setData] = useState<LoadState>({ settings: defaultCheckoutSettings, isBillingActive: false });

  const refs = {
    reviews: useRef<HTMLDivElement | null>(null),
    timer: useRef<HTMLDivElement | null>(null),
    fields: useRef<HTMLDivElement | null>(null),
    payments: useRef<HTMLDivElement | null>(null),
    css: useRef<HTMLDivElement | null>(null),
    translations: useRef<HTMLDivElement | null>(null)
  };

  const setSettings = (next: CheckoutSettings) => setData((current) => ({ ...current, settings: next }));
  const scrollTo = (key: SectionKey) => refs[key].current?.scrollIntoView({ behavior: "smooth", block: "start" });

  useEffect(() => {
    if (!appBridgeState || !shop) {
      setLoading(false);
      return;
    }
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
      const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/settings`, {
        method: "PUT",
        body: JSON.stringify(normalizeForSave(data.settings))
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Save failed (${response.status})`);
      setData((current) => ({ ...current, settings: payload.settings }));
      setMessage("Settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const syncMetafields = async () => {
    if (!appBridgeState || !shop) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/sync`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Sync failed (${response.status})`);
      setMessage("Synced to metafields.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSaving(false);
    }
  };

  const timerSeconds = minutesToSeconds(data.settings.timer.durationValue, data.settings.timer.durationUnit);
  const activeCount = [data.settings.reviews.enabled, data.settings.timer.enabled, data.settings.customFields.enabled, data.settings.payments.enabled, data.settings.css.enabled, data.settings.translations.enabled].filter(Boolean).length;
  const extensionState = data.settings.reviews.enabled || data.settings.timer.enabled || data.settings.customFields.enabled || data.settings.payments.enabled || data.settings.css.enabled || data.settings.translations.enabled;

  if (loading) return <div className="shell"><div className="card card-pad">Loading app state...</div></div>;
  if (!appBridgeState || !shop) return <div className="shell"><div className="card card-pad stack"><div className="chip">Checkout SaaS Admin</div><h1 className="title">Open inside Shopify admin</h1><p className="muted">Embedded session token and shop context are only available when the app opens from Shopify.</p></div></div>;

  return (
    <div className="shell stack">
      <section className="hero">
        <div className="card card-pad stack">
          <div className="hero-top"><div className="chip">Multi-store checkout SaaS</div><div className={`chip ${data.isBillingActive ? "chip--ok" : "chip--warn"}`}>{data.isBillingActive ? "Billing active" : "Billing inactive"}</div></div>
          <h1 className="title">Configure checkout features from one merchant dashboard.</h1>
          <p className="muted">Reviews, timer, custom fields, CSS, translations, and payment preferences live together in a single app.</p>
          <div className="preview-card stack">
            <strong>What lives where</strong>
            <ul className="plain-list">
              {stepItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="row">
            <button className="btn accent" onClick={saveSettings} disabled={saving}>Save and Preview</button>
            <button className="btn secondary" onClick={syncMetafields} disabled={saving}>Sync to Metafields</button>
            {!data.isBillingActive ? (
              <>
                <div className="field" style={{ minWidth: 160 }}>
                  <label>Billing cycle</label>
                  <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as "monthly" | "yearly")}>
                    <option value="monthly">$5 / month</option>
                    <option value="yearly">$50 / year</option>
                  </select>
                </div>
                <button className="btn warn" disabled={saving} onClick={async () => {
                  if (!appBridgeState || !shop) return;
                  setSaving(true); setError(null);
                  try {
                    const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/billing`, { method: "POST", body: JSON.stringify({ billingCycle }) });
                    const payload = await response.json();
                    if (!response.ok) throw new Error(payload.error ?? `Billing request failed (${response.status})`);
                    window.location.href = payload.confirmationUrl;
                  } catch (e) { setError(e instanceof Error ? e.message : "Billing flow failed"); setSaving(false); }
                }}>Activate {billingCycle === "yearly" ? "$50/year" : "$5/month"} plan</button>
              </>
            ) : <span className="chip chip--ok">Billing active</span>}
          </div>
          {error ? <p className="message message--error">{error}</p> : null}
          {message ? <p className="message message--success">{message}</p> : null}
        </div>
        <div className="card card-pad stack">
          <h2 style={{ margin: 0 }}>Store status</h2>
          <div className="preview-card">
            <div><strong>{data.shop?.shop_name ?? shop}</strong></div>
            <div className="muted">{data.shop?.shop_domain}</div>
            <div style={{ marginTop: 12 }}>Plan: {data.shop?.plan ?? "unknown"}</div>
            <div>Subscription: {data.subscription?.status ?? "inactive"}</div>
            <div>Billing cycle: {data.subscription?.billing_cycle ?? billingCycle}</div>
            <div>Active modules: {activeCount}/6</div>
            <div style={{ marginTop: 12 }}>Extension state: {extensionState ? "Configured" : "Disabled"}</div>
          </div>
          <div className="preview-card stack">
            <strong>Checkout Extension</strong>
            <p className="muted" style={{ margin: 0 }}>
              This app's checkout extension shows in Shopify's checkout editor, not as a normal widget inside the admin dashboard.
            </p>
            <p className="muted" style={{ margin: 0 }}>
              After <code>shopify app deploy</code>, open Shopify checkout editor and add the extension block there.
            </p>
          </div>
        </div>
      </section>

      <section className="module stack">
        <div className="section-head"><div><h3>Feature Overview</h3><p className="muted">Click any tile to jump into the section.</p></div></div>
        <div className="grid-3">
          {(Object.keys(titles) as SectionKey[]).map((key) => {
            const enabled = key === "reviews" ? data.settings.reviews.enabled : key === "timer" ? data.settings.timer.enabled : key === "fields" ? data.settings.customFields.enabled : key === "payments" ? data.settings.payments.enabled : key === "css" ? data.settings.css.enabled : data.settings.translations.enabled;
            return <CardButton key={key} title={titles[key]} description={desc[key]} enabled={enabled} onClick={() => scrollTo(key)} />;
          })}
        </div>
      </section>

      <div className="grid-2">
        <section ref={refs.reviews} className="module stack">
          <div className="section-head"><div><h3>Review Section</h3><p className="muted">Testimonials, layout, autoplay, half-stars.</p></div><label className="toggle"><input type="checkbox" checked={data.settings.reviews.enabled} onChange={(e) => setSettings({ ...data.settings, reviews: { ...data.settings.reviews, enabled: e.target.checked } })} /> {data.settings.reviews.enabled ? "Disable" : "Enable"}</label></div>
          <div className="grid-2">
            <div className="field"><label>Layout</label><select value={data.settings.reviews.layout} onChange={(e) => setSettings({ ...data.settings, reviews: { ...data.settings.reviews, layout: e.target.value as CheckoutSettings["reviews"]["layout"] } })}><option value="slider">Slider</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></div>
            <div className="field"><label>Speed (ms)</label><input type="number" min={1000} max={12000} value={data.settings.reviews.speedMs} onChange={(e) => setSettings({ ...data.settings, reviews: { ...data.settings.reviews, speedMs: Number(e.target.value) } })} /></div>
          </div>
          <div className="row"><label className="toggle"><input type="checkbox" checked={data.settings.reviews.autoplay} onChange={(e) => setSettings({ ...data.settings, reviews: { ...data.settings.reviews, autoplay: e.target.checked } })} /> Autoplay</label><label className="toggle"><input type="checkbox" checked={data.settings.reviews.allowHalfStars} onChange={(e) => setSettings({ ...data.settings, reviews: { ...data.settings.reviews, allowHalfStars: e.target.checked } })} /> Half-stars</label></div>
          <div className="preview-card"><strong>Reviews</strong><div className="stack" style={{ marginTop: 12 }}>{data.settings.reviews.reviews.slice(0, 3).map((r) => <div key={r.id} className="module"><div><strong>{r.customerName}</strong></div><div className="muted">{r.description}</div></div>)}</div><button className="btn secondary" style={{ marginTop: 12 }} onClick={() => setSettings({ ...data.settings, reviews: { ...data.settings.reviews, reviews: [...data.settings.reviews.reviews, createReview()] } })}>Add review</button></div>
        </section>

        <section ref={refs.timer} className="module stack">
          <div className="section-head"><div><h3>Countdown Timer</h3><p className="muted">Duration, unit, and reset mode.</p></div><label className="toggle"><input type="checkbox" checked={data.settings.timer.enabled} onChange={(e) => setSettings({ ...data.settings, timer: { ...data.settings.timer, enabled: e.target.checked } })} /> {data.settings.timer.enabled ? "Disable" : "Enable"}</label></div>
          <div className="grid-2">
            <div className="field"><label>Duration</label><input type="number" min={1} value={data.settings.timer.durationValue} onChange={(e) => setSettings({ ...data.settings, timer: { ...data.settings.timer, durationValue: Number(e.target.value) } })} /></div>
            <div className="field"><label>Unit</label><select value={data.settings.timer.durationUnit} onChange={(e) => setSettings({ ...data.settings, timer: { ...data.settings.timer, durationUnit: e.target.value as "minutes" | "hours" } })}><option value="minutes">Minutes</option><option value="hours">Hours</option></select></div>
          </div>
          <div className="field"><label>Reset behavior</label><select value={data.settings.timer.resetBehavior} onChange={(e) => setSettings({ ...data.settings, timer: { ...data.settings.timer, resetBehavior: e.target.value as "session" | "reload" } })}><option value="session">Per session</option><option value="reload">Per reload</option></select></div>
          <div className="preview-card"><div className="muted">Preview</div><div className="timer">{String(Math.floor(timerSeconds / 3600)).padStart(2, "0")}:{String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, "0")}:{String(timerSeconds % 60).padStart(2, "0")}</div></div>
        </section>
      </div>

      <div className="grid-2">
        <section ref={refs.fields} className="module stack">
          <div className="section-head"><div><h3>Custom Fields</h3><p className="muted">Shipping / billing fields with positions.</p></div><label className="toggle"><input type="checkbox" checked={data.settings.customFields.enabled} onChange={(e) => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, enabled: e.target.checked } })} /> {data.settings.customFields.enabled ? "Disable" : "Enable"}</label></div>
          <div className="row"><button className="btn secondary" onClick={() => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: [...data.settings.customFields.fields, createField(data.settings.customFields.fields.length + 1)] } })}>Add field</button></div>
          <div className="stack">{data.settings.customFields.fields.slice(0, 3).map((f) => <div key={f.id} className="preview-card"><div className="row" style={{ justifyContent: "space-between" }}><strong>{f.label}</strong><button className="btn secondary" onClick={() => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: data.settings.customFields.fields.filter((x) => x.id !== f.id) } })}>Delete</button></div><div className="muted">{f.section} / {f.type} / position {f.position}</div></div>)}</div>
        </section>

        <section ref={refs.payments} className="module stack">
          <div className="section-head"><div><h3>Payment Ordering</h3><p className="muted">Plan-gated ordering with fallback.</p></div><label className="toggle"><input type="checkbox" checked={data.settings.payments.enabled} onChange={(e) => setSettings({ ...data.settings, payments: { ...data.settings.payments, enabled: e.target.checked } })} /> {data.settings.payments.enabled ? "Disable" : "Enable"}</label></div>
          <div className="grid-2">
            <div className="field"><label>Fallback mode</label><select value={data.settings.payments.fallbackMode} onChange={(e) => setSettings({ ...data.settings, payments: { ...data.settings.payments, fallbackMode: e.target.value as "display_only" | "shopify_native" } })}><option value="display_only">Display only</option><option value="shopify_native">Shopify native</option></select></div>
            <div className="field"><label>Priority order</label><input type="text" value={data.settings.payments.priorityOrder.join(",")} onChange={(e) => setSettings({ ...data.settings, payments: { ...data.settings.payments, priorityOrder: e.target.value.split(",").map((i) => i.trim()).filter(Boolean) } })} placeholder="card,paypal,shop_pay" /></div>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section ref={refs.css} className="module stack">
          <div className="section-head"><div><h3>Custom CSS</h3><p className="muted">Scoped styling per module.</p></div><label className="toggle"><input type="checkbox" checked={data.settings.css.enabled} onChange={(e) => setSettings({ ...data.settings, css: { ...data.settings.css, enabled: e.target.checked } })} /> {data.settings.css.enabled ? "Disable" : "Enable"}</label></div>
          {data.settings.css.enabled ? (
            <>
              <div className="field"><label>Scope</label><select value={data.settings.css.scope} onChange={(e) => setSettings({ ...data.settings, css: { ...data.settings.css, scope: e.target.value as CheckoutSettings["css"]["scope"] } })}><option value="all">All modules</option><option value="review_section">Review section</option><option value="timer">Timer</option><option value="custom_fields">Custom fields</option></select></div>
              <div className="field"><label>CSS</label><textarea value={data.settings.css.customCss} onChange={(e) => setSettings({ ...data.settings, css: { ...data.settings.css, customCss: e.target.value } })} /></div>
            </>
          ) : <p className="muted">Enable the toggle to edit CSS.</p>}
        </section>

        <section ref={refs.translations} className="module stack">
          <div className="section-head"><div><h3>Translations</h3><p className="muted">Manual strings or JSON editor.</p></div><label className="toggle"><input type="checkbox" checked={data.settings.translations.enabled} onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, enabled: e.target.checked } })} /> {data.settings.translations.enabled ? "Disable" : "Enable"}</label></div>
          <div className="grid-2">
            <div className="field"><label>Default language</label><input type="text" value={data.settings.translations.defaultLanguage} onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, defaultLanguage: e.target.value } })} /></div>
            <div className="field"><label>Languages</label><input type="text" value={data.settings.translations.languages.join(",")} onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, languages: e.target.value.split(",").map((i) => i.trim()).filter(Boolean) } })} /></div>
          </div>
          <div className="field"><label>Mode</label><select value={data.settings.translations.mode} onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, mode: e.target.value as "manual" | "json" } })}><option value="manual">Manual</option><option value="json">JSON editor</option></select></div>
          {data.settings.translations.mode === "json" ? <div className="field"><label>JSON editor</label><textarea value={data.settings.translations.jsonEditor} onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, jsonEditor: e.target.value } })} /></div> : <div className="preview-card"><strong>Manual translation keys</strong><div className="muted">review_title, timer_text, countdown_label, button_text, section_heading</div></div>}
        </section>
      </div>
    </div>
  );
}
