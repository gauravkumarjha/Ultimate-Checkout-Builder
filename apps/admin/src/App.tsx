import React, { useEffect, useMemo, useState } from "react";
import { defaultCheckoutSettings, minutesToSeconds, type CheckoutSettings, type CustomField, type ReviewItem } from "@saas/shared";
import type { AppBridgeState } from "./lib/shopify";
import { apiFetch } from "./lib/api";

type LoadState = {
  shop?: {
    shop_domain: string;
    shop_name: string;
    plan: string;
    is_active: boolean;
  } | null;
  subscription?: {
    status: string;
    trial_ends_at: string | null;
    current_period_ends_at: string | null;
    billing_cycle?: string | null;
  } | null;
  settings: CheckoutSettings;
  isBillingActive: boolean;
};

const createField = (position: number): CustomField => ({
  id: crypto.randomUUID(),
  section: "shipping_address",
  label: "Field label",
  type: "text",
  required: false,
  position
});

const createReview = (): ReviewItem => ({
  id: crypto.randomUUID(),
  imageUrl: "https://picsum.photos/seed/review/400/240",
  customerName: "Customer name",
  starRating: 5,
  allowHalfStars: false,
  description: "Short customer testimonial goes here."
});

const translationKeys = ["review_title", "timer_text", "countdown_label", "button_text", "section_heading"] as const;

function normalizeForSave(settings: CheckoutSettings): CheckoutSettings {
  const next = structuredClone(settings);
  if (next.translations.mode === "json" && next.translations.jsonEditor.trim()) {
    try {
      next.translations.strings = JSON.parse(next.translations.jsonEditor) as CheckoutSettings["translations"]["strings"];
    } catch {
      throw new Error("Invalid translation JSON");
    }
  }
  return next;
}

export function App({ appBridgeState }: { appBridgeState: AppBridgeState | null }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const shop = params.get("shop") ?? "";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [data, setData] = useState<LoadState>({
    settings: defaultCheckoutSettings,
    isBillingActive: false
  });

  useEffect(() => {
    if (!appBridgeState || !shop) {
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/settings`);
        const payload = (await response.json()) as LoadState;
        if (!response.ok) {
          throw new Error(payload?.shop ? "Failed to load settings" : payload.error ?? `Load failed (${response.status})`);
        }
        setData(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load app state");
      } finally {
        setLoading(false);
      }
    })();
  }, [appBridgeState, shop]);

  const saveSettings = async () => {
    if (!appBridgeState || !shop) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payloadSettings = normalizeForSave(data.settings);
      const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/settings`, {
        method: "PUT",
        body: JSON.stringify(payloadSettings)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `Save failed (${response.status})`);
      }
      setData((current) => ({ ...current, settings: payload.settings }));
      setMessage("Settings saved and synced to metafields.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const syncMetafields = async () => {
    if (!appBridgeState || !shop) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/sync`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? `Sync failed (${response.status})`);
      }
      setMessage("Frontend config synced to Shopify metafields.");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed");
    } finally {
      setSaving(false);
    }
  };

  const timerSeconds = useMemo(
    () => minutesToSeconds(data.settings.timer.durationValue, data.settings.timer.durationUnit),
    [data.settings.timer.durationUnit, data.settings.timer.durationValue]
  );

  if (loading) {
    return (
      <div className="shell">
        <div className="card card-pad">Loading app state...</div>
      </div>
    );
  }

  if (!appBridgeState || !shop) {
    return (
      <div className="shell">
        <div className="card card-pad stack">
          <h1 className="title">Checkout SaaS Admin</h1>
          <p className="muted">Open the app inside Shopify admin so the embedded session token and shop context are available.</p>
        </div>
      </div>
    );
  }

  const setSettings = (next: CheckoutSettings) => setData((current) => ({ ...current, settings: next }));
  const reviews = data.settings.reviews;
  const fields = data.settings.customFields.fields;

  return (
    <div className="shell stack">
      <div className="hero">
        <div className="card card-pad stack">
          <div className="chip">Multi-store checkout SaaS</div>
          <h1 className="title">Configure checkout modules without touching theme code.</h1>
          <p className="muted">
            Manage reviews, timer urgency, custom fields, payment ordering, and styling from a single merchant-friendly dashboard.
          </p>
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
            <button
              className="btn warn"
              onClick={async () => {
                if (!appBridgeState || !shop) return;
                setSaving(true);
                setError(null);
                try {
                  const response = await apiFetch(appBridgeState, `/api/shops/${encodeURIComponent(shop)}/billing`, {
                    method: "POST",
                    body: JSON.stringify({ billingCycle })
                  });
                  const payload = await response.json();
                  if (!response.ok) {
                    throw new Error(payload.error ?? `Billing request failed (${response.status})`);
                  }
                  window.location.href = payload.confirmationUrl;
                } catch (billingError) {
                  setError(billingError instanceof Error ? billingError.message : "Billing flow failed");
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              Activate {billingCycle === "yearly" ? "$50/year" : "$5/month"} plan
            </button>
          </>
        ) : (
          <span className="chip">Billing active</span>
        )}
      </div>
          {error ? <p style={{ color: "#9f1239" }}>{error}</p> : null}
          {message ? <p style={{ color: "#166534" }}>{message}</p> : null}
        </div>

        <div className="card card-pad stack">
          <h2 style={{ margin: 0 }}>Store status</h2>
          <div className="preview-card">
            <div><strong>{data.shop?.shop_name ?? shop}</strong></div>
            <div className="muted">{data.shop?.shop_domain}</div>
            <div style={{ marginTop: 12 }}>Plan: {data.shop?.plan ?? "unknown"}</div>
            <div>Subscription: {data.subscription?.status ?? "inactive"}</div>
            <div>Billing cycle: {data.subscription?.billing_cycle ?? billingCycle}</div>
            <div>Trial ends: {data.subscription?.trial_ends_at ?? "n/a"}</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="module stack">
          <h3>Review Section</h3>
          <label className="toggle"><input type="checkbox" checked={reviews.enabled} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, enabled: e.target.checked } })} /> Enable review section</label>
          <div className="grid-2">
            <div className="field">
              <label>Layout</label>
              <select value={reviews.layout} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, layout: e.target.value as CheckoutSettings["reviews"]["layout"] } })}>
                <option value="slider">Slider</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </div>
            <div className="field">
              <label>Slider speed (ms)</label>
              <input type="number" min={1000} max={12000} value={reviews.speedMs} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, speedMs: Number(e.target.value) } })} />
            </div>
          </div>
          <div className="row">
            <label className="toggle"><input type="checkbox" checked={reviews.autoplay} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, autoplay: e.target.checked } })} /> Autoplay</label>
            <label className="toggle"><input type="checkbox" checked={reviews.allowHalfStars} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, allowHalfStars: e.target.checked } })} /> Half-stars</label>
          </div>
          <div className="preview-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>Reviews</strong>
              <button className="btn secondary" onClick={() => reviews.reviews.length < 5 && setSettings({ ...data.settings, reviews: { ...reviews, reviews: [...reviews.reviews, createReview()] } })} disabled={reviews.reviews.length >= 5}>
                Add review
              </button>
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              {reviews.reviews.map((review, index) => (
                <div key={review.id} className="module">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>Review {index + 1}</strong>
                    <button className="btn secondary" onClick={() => setSettings({ ...data.settings, reviews: { ...reviews, reviews: reviews.reviews.filter((item) => item.id !== review.id) } })}>Remove</button>
                  </div>
                  <div className="grid-2" style={{ marginTop: 12 }}>
                    <div className="field">
                      <label>Image URL</label>
                      <input type="url" value={review.imageUrl} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, reviews: reviews.reviews.map((item) => item.id === review.id ? { ...item, imageUrl: e.target.value } : item) } })} />
                    </div>
                    <div className="field">
                      <label>Name</label>
                      <input type="text" value={review.customerName} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, reviews: reviews.reviews.map((item) => item.id === review.id ? { ...item, customerName: e.target.value } : item) } })} />
                    </div>
                  </div>
                  <div className="grid-2" style={{ marginTop: 12 }}>
                    <div className="field">
                      <label>Star rating</label>
                      <input type="number" min={1} max={5} step={reviews.allowHalfStars ? 0.5 : 1} value={review.starRating} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, reviews: reviews.reviews.map((item) => item.id === review.id ? { ...item, starRating: Number(e.target.value) } : item) } })} />
                    </div>
                    <div className="field">
                      <label>Description</label>
                      <input type="text" value={review.description} onChange={(e) => setSettings({ ...data.settings, reviews: { ...reviews, reviews: reviews.reviews.map((item) => item.id === review.id ? { ...item, description: e.target.value } : item) } })} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="module stack">
          <h3>Countdown Timer</h3>
          <label className="toggle"><input type="checkbox" checked={data.settings.timer.enabled} onChange={(e) => setSettings({ ...data.settings, timer: { ...data.settings.timer, enabled: e.target.checked } })} /> Enable timer</label>
          <div className="grid-2">
            <div className="field">
              <label>Duration</label>
              <input type="number" min={1} value={data.settings.timer.durationValue} onChange={(e) => setSettings({ ...data.settings, timer: { ...data.settings.timer, durationValue: Number(e.target.value) } })} />
            </div>
            <div className="field">
              <label>Unit</label>
              <select value={data.settings.timer.durationUnit} onChange={(e) => setSettings({ ...data.settings, timer: { ...data.settings.timer, durationUnit: e.target.value as "minutes" | "hours" } })}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Reset behavior</label>
            <select value={data.settings.timer.resetBehavior} onChange={(e) => setSettings({ ...data.settings, timer: { ...data.settings.timer, resetBehavior: e.target.value as "session" | "reload" } })}>
              <option value="session">Per session</option>
              <option value="reload">Per reload</option>
            </select>
          </div>
          <div className="preview-card">
            <div className="muted">Preview format</div>
            <div className="timer">{String(Math.floor(timerSeconds / 3600)).padStart(2, "0")}:{String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, "0")}:{String(timerSeconds % 60).padStart(2, "0")}</div>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="module stack">
          <h3>Custom Checkout Fields</h3>
          <label className="toggle"><input type="checkbox" checked={data.settings.customFields.enabled} onChange={(e) => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, enabled: e.target.checked } })} /> Enable custom fields</label>
          <div className="row"><button className="btn secondary" onClick={() => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: [...fields, createField(fields.length + 1)] } })}>Add field</button></div>
          <div className="stack">
            {fields.map((field, index) => (
              <div key={field.id} className="preview-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Field {index + 1}</strong>
                  <button className="btn secondary" onClick={() => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: fields.filter((item) => item.id !== field.id) } })}>Delete</button>
                </div>
                <div className="field-row" style={{ marginTop: 12 }}>
                  <div className="field">
                    <label>Label</label>
                    <input type="text" value={field.label} onChange={(e) => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: fields.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item) } })} />
                  </div>
                  <div className="field">
                    <label>Section</label>
                    <select value={field.section} onChange={(e) => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: fields.map((item) => item.id === field.id ? { ...item, section: e.target.value as CustomField["section"] } : item) } })}>
                      <option value="shipping_address">Shipping</option>
                      <option value="billing_address">Billing</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Type</label>
                    <select value={field.type} onChange={(e) => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: fields.map((item) => item.id === field.id ? { ...item, type: e.target.value as CustomField["type"] } : item) } })}>
                      <option value="text">Text</option>
                      <option value="dropdown">Dropdown</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="number">Number</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Position</label>
                    <input type="number" min={1} value={field.position} onChange={(e) => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: fields.map((item) => item.id === field.id ? { ...item, position: Number(e.target.value) } : item) } })} />
                  </div>
                </div>
                <label className="toggle" style={{ marginTop: 12 }}><input type="checkbox" checked={field.required} onChange={(e) => setSettings({ ...data.settings, customFields: { ...data.settings.customFields, fields: fields.map((item) => item.id === field.id ? { ...item, required: e.target.checked } : item) } })} /> Required</label>
              </div>
            ))}
          </div>
        </section>

        <section className="module stack">
          <h3>Payment Method Ordering</h3>
          <p className="muted">This stays plan-gated and falls back to display-only behavior when Shopify restrictions apply.</p>
          <label className="toggle"><input type="checkbox" checked={data.settings.payments.enabled} onChange={(e) => setSettings({ ...data.settings, payments: { ...data.settings.payments, enabled: e.target.checked } })} /> Enable payment ordering</label>
          <div className="grid-2">
            <div className="field">
              <label>Fallback mode</label>
              <select value={data.settings.payments.fallbackMode} onChange={(e) => setSettings({ ...data.settings, payments: { ...data.settings.payments, fallbackMode: e.target.value as "display_only" | "shopify_native" } })}>
                <option value="display_only">Display only</option>
                <option value="shopify_native">Shopify native</option>
              </select>
            </div>
            <div className="field">
              <label>Priority order</label>
              <input type="text" value={data.settings.payments.priorityOrder.join(",")} onChange={(e) => setSettings({ ...data.settings, payments: { ...data.settings.payments, priorityOrder: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) } })} placeholder="card,paypal,shop_pay" />
            </div>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="module stack">
          <h3>Custom CSS</h3>
          <label className="toggle"><input type="checkbox" checked={data.settings.css.enabled} onChange={(e) => setSettings({ ...data.settings, css: { ...data.settings.css, enabled: e.target.checked } })} /> Enable custom styling</label>
          {data.settings.css.enabled ? (
            <>
              <div className="field">
                <label>Scope</label>
                <select value={data.settings.css.scope} onChange={(e) => setSettings({ ...data.settings, css: { ...data.settings.css, scope: e.target.value as CheckoutSettings["css"]["scope"] } })}>
                  <option value="all">All modules</option>
                  <option value="review_section">Review section</option>
                  <option value="timer">Timer</option>
                  <option value="custom_fields">Custom fields</option>
                </select>
              </div>
              <div className="field">
                <label>Custom CSS</label>
                <textarea value={data.settings.css.customCss} onChange={(e) => setSettings({ ...data.settings, css: { ...data.settings.css, customCss: e.target.value } })} placeholder=".checkout-module { border-radius: 20px; }" />
              </div>
            </>
          ) : (
            <p className="muted">CSS editor is hidden until the toggle is enabled.</p>
          )}
        </section>

        <section className="module stack">
          <h3>Translation Module</h3>
          <label className="toggle">
            <input
              type="checkbox"
              checked={data.settings.translations.enabled}
              onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, enabled: e.target.checked } })}
            />
            Enable translation module
          </label>
          <div className="grid-2">
            <div className="field">
              <label>Default language</label>
              <input
                type="text"
                value={data.settings.translations.defaultLanguage}
                onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, defaultLanguage: e.target.value } })}
                placeholder="en"
              />
            </div>
            <div className="field">
              <label>Languages</label>
              <input
                type="text"
                value={data.settings.translations.languages.join(",")}
                onChange={(e) =>
                  setSettings({
                    ...data.settings,
                    translations: {
                      ...data.settings.translations,
                      languages: e.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                    }
                  })
                }
                placeholder="en,hi,fr,es"
              />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Switcher</label>
              <select
                value={data.settings.translations.switcherEnabled ? "enabled" : "disabled"}
                onChange={(e) =>
                  setSettings({
                    ...data.settings,
                    translations: {
                      ...data.settings.translations,
                      switcherEnabled: e.target.value === "enabled"
                    }
                  })
                }
              >
                <option value="disabled">Disabled</option>
                <option value="enabled">Enabled</option>
              </select>
            </div>
            <div className="field">
              <label>Mode</label>
              <select
                value={data.settings.translations.mode}
                onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, mode: e.target.value as "manual" | "json" } })}
              >
                <option value="manual">Manual</option>
                <option value="json">JSON editor</option>
              </select>
            </div>
          </div>
          {data.settings.translations.mode === "manual" ? (
            <div className="stack">
              {data.settings.translations.languages.map((language) => (
                <div key={language} className="preview-card">
                  <strong>{language.toUpperCase()}</strong>
                  <div className="grid-2" style={{ marginTop: 12 }}>
                    {translationKeys.map((key) => (
                      <div className="field" key={key}>
                        <label>{key}</label>
                        <input
                          type="text"
                          value={data.settings.translations.strings[language]?.[key] ?? ""}
                          onChange={(e) =>
                            setSettings({
                              ...data.settings,
                              translations: {
                                ...data.settings.translations,
                                strings: {
                                  ...data.settings.translations.strings,
                                  [language]: {
                                    ...(data.settings.translations.strings[language] ?? {}),
                                    [key]: e.target.value
                                  }
                                }
                              }
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="field">
              <label>JSON editor</label>
              <textarea
                value={data.settings.translations.jsonEditor}
                onChange={(e) => setSettings({ ...data.settings, translations: { ...data.settings.translations, jsonEditor: e.target.value } })}
                placeholder='{"en":{"review_title":"Customer Reviews"}}'
              />
            </div>
          )}
        </section>

        <section className="module stack">
          <h3>Live Preview</h3>
          <div className="preview">
            {data.settings.reviews.enabled ? (
              <div className="preview-card">
                <strong>Review section</strong>
                <div className="review-grid" style={{ marginTop: 12 }}>
                  {data.settings.reviews.reviews.slice(0, 3).map((review) => (
                    <div key={review.id} className="review-item">
                      <img className="review-img" src={review.imageUrl} alt={review.customerName} />
                      <div><strong>{review.customerName}</strong></div>
                      <div>{"★".repeat(Math.round(review.starRating))}</div>
                      <p className="muted">{review.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {data.settings.timer.enabled ? (
              <div className="preview-card">
                <strong>Countdown timer</strong>
                <div style={{ marginTop: 12 }} className="timer">
                  {String(Math.floor(timerSeconds / 3600)).padStart(2, "0")}:{String(Math.floor((timerSeconds % 3600) / 60)).padStart(2, "0")}:{String(timerSeconds % 60).padStart(2, "0")}
                </div>
              </div>
            ) : null}
            {data.settings.customFields.enabled ? (
              <div className="preview-card">
                <strong>Custom fields</strong>
                <div className="stack" style={{ marginTop: 12 }}>
                  {data.settings.customFields.fields.slice(0, 3).map((field) => (
                    <div key={field.id}>
                      <div>{field.label}</div>
                      <div className="muted">{field.section} / {field.type}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
