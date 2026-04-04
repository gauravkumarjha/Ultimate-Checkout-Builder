import React, {useEffect, useState} from "react";
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
import type {CustomField, FrontendConfig, ReviewItem} from "@saas/shared";
import {minutesToSeconds, resolveTranslation} from "@saas/shared";

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

function Stars({value}: {value: number}) {
  const filled = Math.round(value);
  return (
    <InlineStack spacing="extraTight">
      {Array.from({length: 5}).map((_, index) => (
        <Text key={index} emphasis={index < filled ? "bold" : undefined}>
          {index < filled ? "★" : "☆"}
        </Text>
      ))}
    </InlineStack>
  );
}

function FeatureShell({
  title,
  description,
  enabled,
  children
}: {
  title: string;
  description: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <View>
      <BlockStack spacing="base">
        <InlineStack spacing="base" blockAlignment="center">
          <Text emphasis="bold">{title}</Text>
          <Banner status={enabled ? "success" : "warning"} title={enabled ? "Enabled" : "Disabled"} />
        </InlineStack>
        <Text>{description}</Text>
        {children}
      </BlockStack>
    </View>
  );
}

function ReviewSection({
  reviews,
  layout,
  autoplay,
  speedMs,
  allowHalfStars,
  title
}: NonNullable<FrontendConfig["reviews"]> & {allowHalfStars?: boolean; title?: string}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!autoplay || layout !== "slider" || reviews.length < 2) {
      return;
    }

    const intervalId = setInterval(() => {
      setActiveIndex((current) => (current + 1) % reviews.length);
    }, speedMs);

    return () => clearInterval(intervalId);
  }, [autoplay, layout, reviews.length, speedMs]);

  const visibleReviews = layout === "slider" ? [reviews[activeIndex]] : reviews;

  return (
    <FeatureShell
      title={title ?? "Customer reviews"}
      description={`Layout: ${layout} · Autoplay: ${autoplay ? "On" : "Off"} · Half-stars: ${allowHalfStars ? "Yes" : "No"}`}
      enabled
    >
      <BlockStack spacing="base">
        {visibleReviews.map((review: ReviewItem) => (
          <View key={review.id}>
            <BlockStack spacing="tight">
              <InlineStack spacing="base" blockAlignment="center">
                {review.imageUrl ? (
                  <Image source={review.imageUrl} description={review.customerName} />
                ) : null}
                <BlockStack spacing="tight">
                  <Text emphasis="bold">{review.customerName}</Text>
                  <Stars value={review.starRating} />
                </BlockStack>
              </InlineStack>
              <Text>{review.description}</Text>
              {allowHalfStars ? <Text appearance="subdued">Half-star ratings enabled</Text> : null}
            </BlockStack>
          </View>
        ))}
      </BlockStack>
    </FeatureShell>
  );
}

function CountdownTimer({
  timer
}: {
  timer: NonNullable<FrontendConfig["timer"]> & {label?: string};
}) {
  const [remaining, setRemaining] = useState(() =>
    minutesToSeconds(timer.durationValue, timer.durationUnit)
  );

  useEffect(() => {
    if (!timer.enabled) {
      return;
    }

    setRemaining(minutesToSeconds(timer.durationValue, timer.durationUnit));
    const intervalId = setInterval(() => {
      setRemaining((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [timer.enabled, timer.durationValue, timer.durationUnit]);

  const hours = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <FeatureShell
      title={timer.label ?? "Offer ends in"}
      description={`Duration: ${timer.durationValue} ${timer.durationUnit} · Reset: ${timer.resetBehavior}`}
      enabled
    >
      <View>
        <Banner status="info" title="Timer preview">
          {`${hours}:${minutes}:${seconds}`}
        </Banner>
      </View>
    </FeatureShell>
  );
}

function CustomFields({
  config,
  translations,
  language
}: {
  config: NonNullable<FrontendConfig["customFields"]> & {heading?: string};
  translations: FrontendConfig["translations"];
  language: string;
}) {
  const applyAttributeChange = useApplyAttributeChange();

  return (
    <FeatureShell
      title={config.heading ?? "Additional checkout fields"}
      description="Shipping and billing fields render here when enabled from the dashboard."
      enabled
    >
      <BlockStack spacing="base">
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
                {resolveTranslation(
                  translations,
                  language,
                  `field_${field.id}_label`,
                  field.label
                )}
              </Checkbox>
            ) : null}

            {field.type === "dropdown" ? (
              <Select
                label={resolveTranslation(
                  translations,
                  language,
                  `field_${field.id}_label`,
                  field.label
                )}
                options={(field.validation?.options ?? ["Option 1", "Option 2"]).map((option) => ({
                  label: option,
                  value: option
                }))}
                onChange={async (value: string) => {
                  await applyAttributeChange({
                    type: "updateAttribute",
                    key: `checkout_saas_${field.id}`,
                    value
                  });
                }}
              />
            ) : null}

            {(field.type === "text" || field.type === "number") ? (
              <TextField
                label={resolveTranslation(
                  translations,
                  language,
                  `field_${field.id}_label`,
                  field.label
                )}
                placeholder={resolveTranslation(
                  translations,
                  language,
                  `field_${field.id}_placeholder`,
                  field.placeholder ?? ""
                )}
                required={field.required}
                type={field.type === "number" ? "number" : "text"}
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
    </FeatureShell>
  );
}

function App() {
  const appMetafields = useAppMetafields();
  const config = readConfig(appMetafields);
  const activeLanguage = config?.translations?.defaultLanguage ?? "en";

  if (!config) {
    return (
      <View>
        <Banner status="warning" title="Checkout Builder ECS">
          Open the app dashboard, enable a feature, then click Sync Checkout to
          load the block here.
        </Banner>
      </View>
    );
  }

  const localizedReviewTitle = resolveTranslation(
    config.translations,
    activeLanguage,
    "review_title",
    "Customer reviews"
  );
  const localizedTimerText = resolveTranslation(
    config.translations,
    activeLanguage,
    "timer_text",
    "Offer ends in"
  );
  const localizedFieldHeading = resolveTranslation(
    config.translations,
    activeLanguage,
    "section_heading",
    "Additional checkout fields"
  );

  const localizedReviews =
    config.reviews?.reviews.map((review) => ({
      ...review,
      customerName: resolveTranslation(
        config.translations,
        activeLanguage,
        `review_${review.id}_customer_name`,
        review.customerName
      ),
      description: resolveTranslation(
        config.translations,
        activeLanguage,
        `review_${review.id}_description`,
        review.description
      )
    })) ?? [];

  const enabledFeatures = [
    config.reviews?.enabled,
    config.timer?.enabled,
    config.customFields?.enabled,
    config.css?.enabled,
    config.translations?.enabled,
    config.payment?.enabled
  ].filter(Boolean).length;

  return (
    <BlockStack spacing="loose">
      <Banner status="success" title="Checkout Builder ECS">
        Extension is loaded in the checkout editor. Enable modules in the dashboard,
        save them to the database, then sync to show the block here.
      </Banner>
      <Text appearance="subdued">Enabled features: {enabledFeatures}/6</Text>

      {config.reviews?.enabled ? (
        <ReviewSection
          {...config.reviews}
          reviews={localizedReviews}
          allowHalfStars={config.reviews.allowHalfStars}
          title={localizedReviewTitle}
        />
      ) : null}

      {config.timer?.enabled ? (
        <CountdownTimer timer={{...config.timer, label: localizedTimerText}} />
      ) : null}

      {config.customFields?.enabled ? (
        <CustomFields
          config={{...config.customFields, heading: localizedFieldHeading}}
          translations={config.translations}
          language={activeLanguage}
        />
      ) : null}

      {config.payment?.enabled ? (
        <Banner status="warning" title="Payment method ordering">
          {config.payment.plusOnly
            ? "Payment ordering is Plus-gated for this shop."
            : "Using merchant display preferences for payment ordering."}
        </Banner>
      ) : null}

      {config.css?.enabled ? (
        <Banner status="info" title="Custom CSS">
          CSS has been enabled from the dashboard and will be applied when the checkout
          extension renders.
        </Banner>
      ) : null}

      {config.translations?.enabled ? (
        <Banner status="info" title="Translations">
          Translation strings are synced and active for this checkout.
        </Banner>
      ) : null}

      {!config.reviews?.enabled &&
      !config.timer?.enabled &&
      !config.customFields?.enabled &&
      !config.css?.enabled &&
      !config.translations?.enabled &&
      !config.payment?.enabled ? (
        <Banner status="warning" title="No features enabled">
          Turn on at least one module in the dashboard and sync again to show live
          content here.
        </Banner>
      ) : null}
    </BlockStack>
  );
}

export default reactExtension("purchase.checkout.block.render", () => <App />);
