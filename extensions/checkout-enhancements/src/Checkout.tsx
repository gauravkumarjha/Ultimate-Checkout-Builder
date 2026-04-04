import {Banner, reactExtension} from "@shopify/ui-extensions-react/checkout";

export default reactExtension(
  "purchase.checkout.contact.render-after",
  () => <Extension />,
);

function Extension() {
  return (
    <Banner title="Hi, I'm calling">
      Your app is activated.
    </Banner>
  );
}
