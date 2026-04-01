import React from "react";
import ReactDOM from "react-dom/client";
import { createAppBridgeState } from "./lib/shopify";
import { App } from "./App";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <App appBridgeState={createAppBridgeState()} />
  </React.StrictMode>
);
