import { describe, it, expect } from "vitest";
import { timeAgo } from "./timeAgo";

describe("timeAgo", () => {
  const now = new Date("2026-08-23T12:00:00Z");
  it("reads moments, minutes, hours, days — the strip's own words", () => {
    expect(timeAgo(new Date("2026-08-23T11:59:30Z"), now)).toBe("moments ago");
    expect(timeAgo(new Date("2026-08-23T11:56:00Z"), now)).toBe("4 min ago");
    expect(timeAgo(new Date("2026-08-23T11:00:00Z"), now)).toBe("1 hour ago");
    expect(timeAgo(new Date("2026-08-23T09:00:00Z"), now)).toBe("3 hours ago");
    expect(timeAgo(new Date("2026-08-22T12:00:00Z"), now)).toBe("1 day ago");
    expect(timeAgo(new Date("2026-08-20T12:00:00Z"), now)).toBe("3 days ago");
  });
  it("changes word exactly at each boundary it branches on", () => {
    // The samples above are all interiors, so every threshold could move by a
    // unit in either direction and stay green. These are the six values the
    // three comparisons at `timeAgo.ts:4`, `:6` and `:8` actually turn on.
    const at = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);
    const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN;

    expect(at(59 * SEC)).toBe("moments ago");
    expect(at(60 * SEC)).toBe("1 min ago");

    expect(at(59 * MIN)).toBe("59 min ago");
    expect(at(60 * MIN)).toBe("1 hour ago");

    expect(at(23 * HOUR)).toBe("23 hours ago");
    expect(at(24 * HOUR)).toBe("1 day ago");
  });

  it("never goes negative for a stamp from the future", () => {
    expect(timeAgo(new Date("2026-08-23T12:05:00Z"), now)).toBe("moments ago");
  });
});
