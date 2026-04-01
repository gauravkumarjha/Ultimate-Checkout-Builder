import { z } from "zod";

export const reviewLayoutSchema = z.enum(["slider", "horizontal", "vertical"]);
export const timerResetSchema = z.enum(["session", "reload"]);
export const fieldSectionSchema = z.enum(["shipping_address", "billing_address"]);
export const fieldTypeSchema = z.enum(["text", "dropdown", "checkbox", "number"]);
export const cssScopeSchema = z.enum(["review_section", "timer", "custom_fields", "all"]);
export const translationModeSchema = z.enum(["manual", "json"]);

export const translationStringMapSchema = z.record(z.string()).default({});
export const translationLanguageSchema = z.object({
  review_title: z.string().default("Customer Reviews"),
  timer_text: z.string().default("Offer ends in"),
  countdown_label: z.string().default("Hurry up"),
  button_text: z.string().default("Continue"),
  section_heading: z.string().default("Additional checkout fields")
});

export const translationSchema = z.object({
  enabled: z.boolean().default(false),
  defaultLanguage: z.string().default("en"),
  languages: z.array(z.string()).default(["en"]),
  switcherEnabled: z.boolean().default(false),
  mode: translationModeSchema.default("manual"),
  strings: z.record(translationStringMapSchema).default({}),
  jsonEditor: z.string().default("")
});

export const reviewItemSchema = z.object({
  id: z.string().min(1),
  imageUrl: z.string().url().or(z.string().startsWith("data:")),
  customerName: z.string().min(1).max(80),
  starRating: z.number().min(1).max(5),
  allowHalfStars: z.boolean().optional().default(false),
  description: z.string().min(1).max(500)
});

export const reviewSectionSchema = z.object({
  enabled: z.boolean().default(false),
  layout: reviewLayoutSchema.default("slider"),
  autoplay: z.boolean().default(true),
  speedMs: z.number().min(1000).max(12000).default(4500),
  maxReviews: z.number().min(1).max(5).default(5),
  allowHalfStars: z.boolean().default(false),
  reviews: z.array(reviewItemSchema).max(5).default([])
});

export const timerSectionSchema = z.object({
  enabled: z.boolean().default(false),
  durationValue: z.number().min(1).default(10),
  durationUnit: z.enum(["minutes", "hours"]).default("minutes"),
  resetBehavior: timerResetSchema.default("session"),
  displayFormat: z.literal("HH:MM:SS").default("HH:MM:SS")
});

export const customFieldSchema = z.object({
  id: z.string().min(1),
  section: fieldSectionSchema,
  label: z.string().min(1).max(80),
  type: fieldTypeSchema,
  required: z.boolean().default(false),
  position: z.number().int().min(1).default(1),
  placeholder: z.string().max(120).optional(),
  validation: z
    .object({
      regex: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      options: z.array(z.string().min(1)).optional()
    })
    .optional()
});

export const customFieldsSectionSchema = z.object({
  enabled: z.boolean().default(false),
  fields: z.array(customFieldSchema).default([])
});

export const cssSectionSchema = z.object({
  enabled: z.boolean().default(false),
  scope: cssScopeSchema.default("all"),
  customCss: z.string().max(12000).default("")
});

export const paymentSectionSchema = z.object({
  enabled: z.boolean().default(false),
  plusOnly: z.boolean().default(true),
  fallbackMode: z.enum(["display_only", "shopify_native"]).default("display_only"),
  enabledMethods: z.array(z.string()).default([]),
  disabledMethods: z.array(z.string()).default([]),
  priorityOrder: z.array(z.string()).default([])
});

export const analyticsSectionSchema = z.object({
  enabled: z.boolean().default(false),
  trackImpressions: z.boolean().default(true),
  trackClicks: z.boolean().default(true)
});

export const localizationSectionSchema = z.object({
  enabled: z.boolean().default(false),
  locale: z.string().default("auto")
});

export const abTestingSectionSchema = z.object({
  enabled: z.boolean().default(false),
  variantCount: z.number().int().min(2).max(5).default(2)
});

export const defaultReviewSection = reviewSectionSchema.parse({});
export const defaultTimerSection = timerSectionSchema.parse({});
export const defaultCustomFieldsSection = customFieldsSectionSchema.parse({});
export const defaultCssSection = cssSectionSchema.parse({});
export const defaultPaymentSection = paymentSectionSchema.parse({});
export const defaultAnalyticsSection = analyticsSectionSchema.parse({});
export const defaultLocalizationSection = localizationSectionSchema.parse({});
export const defaultAbTestingSection = abTestingSectionSchema.parse({});
export const defaultTranslationSection = translationSchema.parse({});

export const checkoutSettingsSchema = z.object({
  reviews: reviewSectionSchema.default(defaultReviewSection),
  timer: timerSectionSchema.default(defaultTimerSection),
  customFields: customFieldsSectionSchema.default(defaultCustomFieldsSection),
  css: cssSectionSchema.default(defaultCssSection),
  payments: paymentSectionSchema.default(defaultPaymentSection),
  translations: translationSchema.default(defaultTranslationSection),
  featureFlags: z.object({
    analytics: analyticsSectionSchema.default(defaultAnalyticsSection),
    localization: localizationSectionSchema.default(defaultLocalizationSection),
    abTesting: abTestingSectionSchema.default(defaultAbTestingSection)
  }).default({
    analytics: defaultAnalyticsSection,
    localization: defaultLocalizationSection,
    abTesting: defaultAbTestingSection
  })
});

export type CheckoutSettings = z.infer<typeof checkoutSettingsSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type CustomField = z.infer<typeof customFieldSchema>;

export const defaultCheckoutSettings: CheckoutSettings = checkoutSettingsSchema.parse({
  reviews: defaultReviewSection,
  timer: defaultTimerSection,
  customFields: defaultCustomFieldsSection,
  css: defaultCssSection,
  payments: defaultPaymentSection,
  translations: defaultTranslationSection,
  featureFlags: {
    analytics: defaultAnalyticsSection,
    localization: defaultLocalizationSection,
    abTesting: defaultAbTestingSection
  }
});

export function normalizeCheckoutSettings(input: unknown): CheckoutSettings {
  return checkoutSettingsSchema.parse(input);
}

export type FrontendConfig = {
  version: 1;
  generatedAt: string;
  reviews?: CheckoutSettings["reviews"] & { approvedCss?: string };
  timer?: CheckoutSettings["timer"];
  customFields?: CheckoutSettings["customFields"];
  css?: CheckoutSettings["css"];
  payment?: CheckoutSettings["payments"];
  translations?: CheckoutSettings["translations"];
  featureFlags?: CheckoutSettings["featureFlags"];
};

export function buildFrontendConfig(settings: CheckoutSettings, isPlusShop: boolean): FrontendConfig {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    reviews: settings.reviews.enabled ? settings.reviews : undefined,
    timer: settings.timer.enabled ? settings.timer : undefined,
    customFields: settings.customFields.enabled ? settings.customFields : undefined,
    css: settings.css.enabled ? settings.css : undefined,
    translations: settings.translations.enabled ? settings.translations : undefined,
    payment: settings.payments.enabled ? {
      ...settings.payments,
      plusOnly: settings.payments.plusOnly && isPlusShop
    } : undefined,
    featureFlags: settings.featureFlags
  };
}

export function minutesToSeconds(value: number, unit: "minutes" | "hours"): number {
  return unit === "hours" ? value * 60 * 60 : value * 60;
}

export function resolveTranslation(
  translations: CheckoutSettings["translations"] | undefined,
  language: string | undefined,
  key: string,
  fallback: string
): string {
  if (!translations?.enabled) {
    return fallback;
  }

  const locale = language?.toLowerCase();
  const defaultLanguage = translations.defaultLanguage.toLowerCase();
  const candidates = [locale, defaultLanguage].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const map = translations.strings[candidate];
    if (map && typeof map[key] === "string" && map[key].trim()) {
      return map[key];
    }
  }

  return fallback;
}
