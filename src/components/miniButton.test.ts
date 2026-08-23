import { describe, it, expect } from "vitest";
import { miniBtnClass, miniBtnFillClass, miniBtnTonalClass, miniSetClass } from "./miniButton";

describe("the mini button tier", () => {
  it("is 26px tall on the control radius, never a pill", () => {
    for (const cls of [miniBtnClass, miniBtnFillClass, miniBtnTonalClass]) {
      expect(cls).toContain("h-[26px]");
      expect(cls).toContain("rounded-control");
      expect(cls).not.toContain("rounded-pill");
      expect(cls).toContain("text-small");
    }
  });

  it("the outlined tier borders in --line-2 on the page; fill and tonal carry no visible border", () => {
    expect(miniBtnClass).toContain("border-line-2");
    expect(miniBtnClass).toContain("bg-page");
    expect(miniBtnFillClass).toContain("bg-fill");
    expect(miniBtnFillClass).toContain("text-on-fill");
    expect(miniBtnFillClass).toContain("border-transparent");
    expect(miniBtnTonalClass).toContain("bg-plane-2");
    expect(miniBtnTonalClass).toContain("border-transparent");
  });

  it("a set is a wrapping row on a 6px gap", () => {
    expect(miniSetClass).toBe("flex flex-wrap gap-1.5");
  });
});
