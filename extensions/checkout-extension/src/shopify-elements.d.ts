import "preact";

declare module "preact" {
  namespace createElement.JSX {
    interface IntrinsicElements {
      "s-banner": any;
      "s-block-stack": any;
    }
  }
}
