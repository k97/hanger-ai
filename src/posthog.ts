import posthog from "posthog-js";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

export const isPostHogConfigured = Boolean(posthogKey && posthogHost);

if (isPostHogConfigured) {
  posthog.init(posthogKey!, {
    api_host: posthogHost,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    logs: {
      serviceName: "hanger-desktop",
      environment: import.meta.env.DEV ? "development" : "production",
    },
  });
} else if (import.meta.env.DEV) {
  if (!posthogKey) {
    console.error(
      new Error(
        "VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured",
      ),
    );
  }
  if (!posthogHost) {
    console.error(
      new Error(
        "VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured",
      ),
    );
  }
}

export default posthog;
