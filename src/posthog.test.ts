import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const optIn = vi.fn();
const optOut = vi.fn();
vi.mock("posthog-js", () => ({
  default: { init, opt_in_capturing: optIn, opt_out_capturing: optOut },
}));

type BeforeSend = (event: { event: string }) => { event: string } | null;

async function load() {
  vi.resetModules();
  const mod = await import("./posthog");
  const config = init.mock.calls[0][1] as Record<string, unknown> & { before_send: BeforeSend };
  return { mod, config };
}

describe("PostHog in Hanger", () => {
  beforeEach(() => {
    init.mockClear();
    optIn.mockClear();
    optOut.mockClear();
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
    vi.stubEnv("VITE_POSTHOG_HOST", "https://example.invalid");
  });
  afterEach(() => vi.unstubAllEnvs());

  // Clicked text in Hanger is asset names, server names and file paths.
  it("captures nothing from the DOM, records no session and loads no remote script", async () => {
    const { config } = await load();
    expect(config).toMatchObject({
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
    });
  });

  it("starts opted out, before any consent is known", async () => {
    await load();
    expect(optOut).toHaveBeenCalled();
    expect(optIn).not.toHaveBeenCalled();
  });

  it("sends product events only with usage consent, and exceptions only with crash consent", async () => {
    const { mod, config } = await load();
    const event = { event: "skill_switch_changed" };
    const exception = { event: "$exception" };

    expect(config.before_send(event)).toBeNull();
    expect(config.before_send(exception)).toBeNull();

    mod.setPostHogConsent(true, false);
    expect(config.before_send(event)).toBe(event);
    expect(config.before_send(exception)).toBeNull();

    mod.setPostHogConsent(false, true);
    expect(config.before_send(event)).toBeNull();
    expect(config.before_send(exception)).toBe(exception);

    mod.setPostHogConsent(false, false);
    expect(optOut).toHaveBeenCalledTimes(2);
  });
});
