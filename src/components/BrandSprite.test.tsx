// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import BrandSprite, { SPRITE } from "./BrandSprite";
import { BRANDS, BRAND_IDS } from "../data/brands";

afterEach(cleanup);

// One extra symbol per brand carrying a dark variant (Task 19).
const DARK_COUNT = BRAND_IDS.filter((id) => BRANDS[id].darkSvg !== undefined).length;

describe("BrandSprite", () => {
  it("holds one symbol per brand plus the generic, each with a viewBox and a unique id", () => {
    render(<BrandSprite />);
    const sprite = screen.getByTestId("brand-sprite");
    expect(sprite.getAttribute("aria-hidden")).toBe("true");
    const symbols = Array.from(sprite.querySelectorAll("symbol"));
    expect(symbols.length).toBe(BRAND_IDS.length + 1 + DARK_COUNT);
    const ids = symbols.map((s) => s.getAttribute("id"));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of BRAND_IDS) expect(ids).toContain(`brand-${id}`);
    expect(ids).toContain("brand-generic");
    for (const s of symbols) expect(s.getAttribute("viewBox"), s.id).toBeTruthy();
  });

  it("is a single string built once at module load", () => {
    expect(typeof SPRITE).toBe("string");
    expect(SPRITE.startsWith("<symbol ")).toBe(true);
    expect((SPRITE.match(/<symbol /g) ?? []).length).toBe(BRAND_IDS.length + 1 + DARK_COUNT);
  });

  it("emits a -dark symbol for every brand that has a dark mark", () => {
    render(<BrandSprite />);
    const sprite = screen.getByTestId("brand-sprite");
    const ids = Array.from(sprite.querySelectorAll("symbol")).map((s) => s.getAttribute("id"));
    expect(ids).toContain("brand-codex-dark");
    // One per dark variant, no more: 11 brands + generic + 1 dark.
    expect(ids.filter((id) => id?.endsWith("-dark"))).toEqual(["brand-codex-dark"]);
  });
});
