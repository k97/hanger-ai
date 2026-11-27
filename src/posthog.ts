import posthog from "posthog-js";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

let usageConsent = false;
let crashConsent = false;

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2026-08-30",
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
export const posthogAppLogger = {
  info(message: string, attributes: LogAttributes) {
    if (isPostHogConfigured) posthog.logger.info(message, attributes);
  },
  warn(message: string, attributes: LogAttributes) {
    if (isPostHogConfigured) posthog.logger.warn(message, attributes);
  },
};

export default posthog;
