import "./instrument";

import React from "react";
import ReactDOM from "react-dom/client";
import { reactErrorHandler } from "@sentry/react";
import App from "./App";
import BrandSprite from "./components/BrandSprite";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <React.StrictMode>
    {/* Sits beside App, not inside it: App early-returns for the loading and
        onboarding trees, and every <use href="#brand-…"> must resolve on
        every screen. */}
    <BrandSprite />
    <App />
  </React.StrictMode>
);
