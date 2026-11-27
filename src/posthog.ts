import posthog from "posthog-js";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

let usageConsent = false;
let crashConsent = false;

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2026-08-30",
    // Only the named events below and consented exceptions leave the app. Clicked
    // text in Hanger is asset names, server names and file paths, so nothing is
    // captured from the DOM, and no remote script is loaded into the webview.
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    person_profiles: "identified_only",
    logs: {
      serviceName: "hanger-desktop-renderer",
      environment: import.meta.env.MODE,
    },
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    before_send: (event) =>
      event.event === "$exception"
        ? crashConsent
          ? event
          : null
        : usageConsent
          ? event
          : null,
  });
  posthog.opt_out_capturing();
} else if (import.meta.env.DEV) {
  const missingVariable = posthogKey ? "VITE_POSTHOG_HOST" : "VITE_POSTHOG_KEY";

  console.error(
    new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    ),
  );
}

export const isPostHogConfigured = Boolean(posthogKey && posthogHost);

export function setPostHogConsent(usage: boolean, crash: boolean) {
  usageConsent = usage;
  crashConsent = crash;
  if (!isPostHogConfigured) return;
  if (usage || crash) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}

type LogAttributes = Record<string, string | number | boolean>;

// Purpose-built records only: existing console and Tauri-plugin logs remain local.
// Logs go through PostHog's logs extension, not before_send, so consent is checked here.
export const posthogAppLogger = {
  info(message: string, attributes: LogAttributes) {
    if (isPostHogConfigured && usageConsent) posthog.logger.info(message, attributes);
  },
  warn(message: string, attributes: LogAttributes) {
    if (isPostHogConfigured && usageConsent) posthog.logger.warn(message, attributes);
  },
};

export default posthog;
