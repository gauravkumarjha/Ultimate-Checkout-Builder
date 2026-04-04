import type {} from "@shopify/ui-extensions/checkout/preact";
import {
  createElement,
  render,
} from "preact";

import {
  useApplyAttributeChange,
  useAttributeValues,
  useInstructions,
} from "@shopify/ui-extensions/checkout/preact";

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [freeGiftRequested] = useAttributeValues(["requestedFreeGift"]);
  const instructions = useInstructions();
  const applyAttributeChange = useApplyAttributeChange();

  async function onCheckboxChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const isChecked = input.checked;

    if (!instructions.attributes.canUpdateAttributes) {
      console.error("Attributes cannot be updated in this checkout");
      return;
    }

    const result = await applyAttributeChange({
      key: "requestedFreeGift",
      type: "updateAttribute",
      value: isChecked ? "yes" : "no",
    });

    console.log("applyAttributeChange result", result);
  }

  return (
    <s-checkbox
      checked={freeGiftRequested === "yes"}
      onChange={onCheckboxChange}
      label="I would like to receive a free gift with my order"
    />
  );
}
