import { describe, it, expect } from "vitest";
import { screenNameFor } from "./screenName";

/**
 * The sidebar's selected item is a screen id, or a repository path. GA4 gets
 * one of six fixed names for it — never the path, which is the promise
 * docs/telemetry.md makes about what leaves the machine.
 */
describe("screenNameFor", () => {
  it("maps each rail screen to its reporting name", () => {
    expect(screenNameFor("profile")).toBe("my_machine");
    expect(screenNameFor("global")).toBe("my_machine");
    expect(screenNameFor("review")).toBe("needs_review");
    expect(screenNameFor("linkmap")).toBe("link_map");
    expect(screenNameFor("discovery")).toBe("discovery");
    expect(screenNameFor("design")).toBe("design_system");
  });

  it("reports any repository path as 'repo', never the path", () => {
    expect(screenNameFor("/Users/someone/Work/Labs/hanger-ai")).toBe("repo");
    expect(screenNameFor("C:\\Users\\someone\\repo")).toBe("repo");
  });

  it("never lets an unknown id through as itself", () => {
    expect(screenNameFor("settings")).toBe("repo");
    expect(screenNameFor("")).toBe("repo");
  });
});
