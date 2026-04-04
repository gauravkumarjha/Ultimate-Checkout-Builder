import "@shopify/ui-extensions/checkout/preact";
import {createElement, render} from "preact";

function Extension() {
  return (
    <s-block-stack gap="base">
      <s-banner status="info" title="checkout-enhancements is active">
        If you can see this banner in checkout, the extension is working and
        correctly registered on purchase.checkout.block.render.
      </s-banner>
    </s-block-stack>
  );
}

export default function extension() {
  render(<Extension />, document.body);
}
