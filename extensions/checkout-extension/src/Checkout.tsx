import {
  Banner,
  BlockStack,
  Text,
  reactExtension,
} from "@shopify/ui-extensions-react/checkout";

function Extension() {
  return (
    <BlockStack spacing="base">
      <Banner status="info" title="checkout-enhancements is active">
        <Text>
          If you can see this banner in checkout, the extension is working and
          correctly registered on purchase.checkout.block.render.
        </Text>
      </Banner>
    </BlockStack>
  );
}

export default reactExtension("purchase.checkout.block.render", () => <Extension />);
