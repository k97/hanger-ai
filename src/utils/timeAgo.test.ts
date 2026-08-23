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
  it("never goes negative for a stamp from the future", () => {
    expect(timeAgo(new Date("2026-08-23T12:05:00Z"), now)).toBe("moments ago");
  });
});
