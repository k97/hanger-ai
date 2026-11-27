import "./instrument";
import "./posthog";

import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { reactErrorHandler } from "@sentry/react";
import App from "./App";
import BrandSprite from "./components/BrandSprite";
import "./styles/index.css";

// Agentation, the annotation toolbar for agent feedback (Karthik, 2026-11-25).
// It ships in dev builds only, like the design-system page: behind this
// build-time constant the dynamic import is dead in production, so Vite emits
// no chunk for it. No `endpoint` prop, so nothing leaves the webview; notes
// are copied out by hand.
const Agentation = import.meta.env.DEV
  ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation })))
  : null;

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
    {Agentation ? (
      <Suspense fallback={null}>
        <Agentation />
      </Suspense>
    ) : null}
  </React.StrictMode>
);
