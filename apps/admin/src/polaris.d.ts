export {};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-banner": any;
      "s-block-stack": any;
      "s-box": any;
      "s-button": any;
      "s-checkbox": any;
      "s-inline-stack": any;
      "s-image": any;
      "s-select": any;
      "s-text": any;
      "s-text-field": any;
    }
  }
}
