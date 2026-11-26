import { describe, it, expect } from "vitest";
import { cn } from "./utils";

// tailwind-merge only knows Tailwind's default scales. Hanger's own size,
// radius and leading names (`text-small`, `rounded-pill`, `leading-body`) are
// not on them, so unregistered it reads `text-small` as a text *colour* and
// drops it the moment a real colour follows: `cn("text-small", "text-ink-2")`
// came back as "text-ink-2". Each case here is a pair a shadcn component and
// a Hanger caller actually combine.
describe("cn", () => {
  it("keeps a Hanger type size beside a text colour", () => {
    expect(cn("text-small", "text-ink-2")).toBe("text-small text-ink-2");
    expect(cn("text-micro tabular", "text-ink-3")).toBe("text-micro tabular text-ink-3");
  });

  it("lets a later Hanger size replace an earlier one", () => {
    expect(cn("text-small", "text-micro")).toBe("text-micro");
  });

  it("treats Hanger's radii as one group, so a caller's radius wins", () => {
    expect(cn("rounded-pill", "rounded-inner")).toBe("rounded-inner");
  });

  it("treats Hanger's leadings as one group", () => {
    expect(cn("leading-body", "leading-caption")).toBe("leading-caption");
  });

  it("merges ordinary utilities the way shadcn expects", () => {
    expect(cn("px-4", "px-3 @[576px]:px-4")).toBe("px-3 @[576px]:px-4");
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});
