import posthog, { isPostHogConfigured } from "./posthog";

type LogAttributes = Record<string, boolean | number | string>;

export const posthogLog = {
  info(message: string, attributes: LogAttributes) {
    if (isPostHogConfigured) {
      posthog.logger.info(message, attributes);
    }
  },
};
