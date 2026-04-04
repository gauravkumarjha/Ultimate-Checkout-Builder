import React, { useEffect, useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Checkbox,
  Image,
  InlineStack,
  Select,
  Text,
  TextField,
  View,
  reactExtension,
  useAppMetafields,
  useApplyAttributeChange
} from "@shopify/ui-extensions-react/checkout";
import type { CustomField, FrontendConfig, ReviewItem } from "@saas/shared";
import { minutesToSeconds, resolveTranslation } from "@saas/shared";

type MetafieldEntry = {
  namespace?: string;
  key?: string;
  value?: string;
};

function readConfig(entries: unknown): FrontendConfig | null {
  const list = Array.isArray(entries) ? entries : [];
  const found = list.find((entry) => {
    const item = entry as MetafieldEntry;
    return item.namespace === "checkout_saas" && item.key === "config";
  }) as MetafieldEntry | undefined;

  if (!found?.value) {
    return null;
  }

  try {
    return JSON.parse(found.value) as FrontendConfig;
  } catch {
    return null;
  }
}

function Stars({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <InlineStack spacing="extraTight">
      {Array.from({ length: 5 }).map((_, index) => (
        <Text key={index}>{index < filled ? "★" : "☆"}</Text>
      ))}
    </InlineStack>
  );
}

function ReviewSection({
  reviews,
  layout,
  autoplay,
  speedMs,
  allowHalfStars,
  title
}: NonNullable<FrontendConfig["reviews"]> & { allowHalfStars?: boolean; title?: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!autoplay || layout !== "slider" || reviews.length < 2) {
      return;
    }
    const id = setInterval(() => {
      setActiveIndex((current) => (current + 1) % reviews.length);
    }, speedMs);
    return () => clearInterval(id);
  }, [autoplay, layout, reviews.length, speedMs]);

  const visibleReviews = layout === "slider" ? [reviews[activeIndex]] : reviews;

  return (
    <View>
      <BlockStack spacing="base">
        <Text emphasis="bold">{title ?? "Customer reviews"}</Text>
        <BlockStack spacing="base">
          {visibleReviews.map((review: ReviewItem) => (
            <View key={review.id}>
              <InlineStack spacing="base" blockAlignment="center">
                <Image source={review.imageUrl} description={review.customerName} />
                <BlockStack spacing="tight">
                  <Text emphasis="bold">{review.customerName}</Text>
                  <Stars value={review.starRating} />
                  <Text>{review.description}</Text>
                  {allowHalfStars ? <Text appearance="subdued">Half-star ratings enabled</Text> : null}
                </BlockStack>
              </InlineStack>
            </View>
          ))}
        </BlockStack>
      </BlockStack>
    </View>
  );
}

function CountdownTimer({ timer }: { timer: NonNullable<FrontendConfig["timer"]> & { label?: string } }) {
  const [remaining, setRemaining] = useState(() => minutesToSeconds(timer.durationValue, timer.durationUnit));

  useEffect(() => {
    if (!timer.enabled) return;
    const id = setInterval(() => {
      setRemaining((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => clearInterval(id);
  }, [timer.enabled]);

  const hours = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <View>
      <BlockStack spacing="tight">
        <Text emphasis="bold">{timer.label ?? "Offer ends in"}</Text>
        <Text>{`${hours}:${minutes}:${seconds}`}</Text>
        <Text appearance="subdued">Reset behavior: {timer.resetBehavior}</Text>
      </BlockStack>
    </View>
  );
}

function CustomFields({
  config,
  translations,
  language
}: {
  config: NonNullable<FrontendConfig["customFields"]> & { heading?: string };
  translations: FrontendConfig["translations"];
  language: string;
}) {
  const applyAttributeChange = useApplyAttributeChange();

  return (
    <View>
      <BlockStack spacing="base">
        <Text emphasis="bold">{config.heading ?? "Additional checkout fields"}</Text>
        {config.fields.map((field: CustomField) => (
          <BlockStack key={field.id} spacing="tight">
            {field.type === "checkbox" ? (
              <Checkbox
                onChange={async (checked: boolean) => {
                  await applyAttributeChange({
                    type: "updateAttribute",
                    key: `checkout_saas_${field.id}`,
                    value: String(Boolean(checked))
                  });
                }}
              >
                {resolveTranslation(translations, language, `field_${field.id}_label`, field.label)}
              </Checkbox>
            ) : null}
            {field.type === "dropdown" ? (
              <Select
                label={resolveTranslation(translations, language, `field_${field.id}_label`, field.label)}
                options={(field.validation?.options ?? ["Option 1", "Option 2"]).map((option) => ({ label: option, value: option }))}
                onChange={async (value: string) => {
                  await applyAttributeChange({
                    type: "updateAttribute",
                    key: `checkout_saas_${field.id}`,
                    value
                  });
                }}
              />
            ) : null}
            {field.type === "text" || field.type === "number" ? (
              <TextField
                label={resolveTranslation(translations, language, `field_${field.id}_label`, field.label)}
                placeholder={resolveTranslation(translations, language, `field_${field.id}_placeholder`, field.placeholder ?? "")}
                required={field.required}
                onChange={async (value: string) => {
                  await applyAttributeChange({
                    type: "updateAttribute",
                    key: `checkout_saas_${field.id}`,
                    value
                  });
                }}
              />
            ) : null}
          </BlockStack>
        ))}
      </BlockStack>
    </View>
  );
}

export default reactExtension("purchase.checkout.block.render", () => {
  const appMetafields = useAppMetafields();
  const config = readConfig(appMetafields);

  const normalizedConfig = useMemo(() => config, [config]);
  const activeLanguage = normalizedConfig?.translations?.defaultLanguage ?? "en";

  if (!normalizedConfig) {
    return (
      <View>
        <Banner status="warning" title="Checkout features not configured yet">
          Open the app dashboard, enable a feature, then click Sync Checkout to load reviews, timer, fields, CSS, or translations here.
        </Banner>
      </View>
    );
  }

  const localizedReviewTitle = resolveTranslation(
    normalizedConfig.translations,
    activeLanguage,
    "review_title",
    "Customer reviews"
  );
  const localizedTimerText = resolveTranslation(
    normalizedConfig.translations,
    activeLanguage,
    "timer_text",
    "Offer ends in"
  );
  const localizedFieldHeading = resolveTranslation(
    normalizedConfig.translations,
    activeLanguage,
    "section_heading",
    "Additional checkout fields"
  );
  const localizedReviews = normalizedConfig.reviews?.reviews.map((review) => ({
    ...review,
    customerName: resolveTranslation(
      normalizedConfig.translations,
      activeLanguage,
      `review_${review.id}_customer_name`,
      review.customerName
    ),
    description: resolveTranslation(
      normalizedConfig.translations,
      activeLanguage,
      `review_${review.id}_description`,
      review.description
    )
  }));

  return (
    <BlockStack spacing="loose">
      <Banner status="info" title="Checkout Builder extension active">
        This block is loaded from the checkout editor. If a section is enabled in the dashboard and synced, it appears below.
      </Banner>
      {normalizedConfig.reviews?.enabled ? (
        <ReviewSection
          {...normalizedConfig.reviews}
          reviews={localizedReviews ?? normalizedConfig.reviews.reviews}
          allowHalfStars={normalizedConfig.reviews.allowHalfStars}
          title={localizedReviewTitle}
        />
      ) : null}
      {normalizedConfig.timer?.enabled ? (
        <CountdownTimer timer={{ ...normalizedConfig.timer, label: localizedTimerText }} />
      ) : null}
      {normalizedConfig.customFields?.enabled ? (
        <CustomFields
          config={{ ...normalizedConfig.customFields, heading: localizedFieldHeading }}
          translations={normalizedConfig.translations}
          language={activeLanguage}
        />
      ) : null}
      {normalizedConfig.payment?.enabled ? (
        <Banner status="warning" title="Payment method ordering">
          {normalizedConfig.payment.plusOnly
            ? "This shop uses a Plus-gated fallback for payment ordering."
            : "Shopify restrictions apply; using merchant display preferences only."}
        </Banner>
      ) : null}
      {!normalizedConfig.reviews?.enabled &&
      !normalizedConfig.timer?.enabled &&
      !normalizedConfig.customFields?.enabled &&
      !normalizedConfig.css?.enabled &&
      !normalizedConfig.translations?.enabled &&
      !normalizedConfig.payment?.enabled ? (
        <Banner status="warning" title="No features enabled">
          Turn on one or more modules in the dashboard and sync again to see live content here.
        </Banner>
      ) : null}
    </BlockStack>
  );
});
