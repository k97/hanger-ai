// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import BrandSprite, { SPRITE } from "./BrandSprite";
import { BRAND_IDS } from "../data/brands";

afterEach(cleanup);

describe("BrandSprite", () => {
  it("holds one symbol per brand plus the generic, each with a viewBox and a unique id", () => {
    render(<BrandSprite />);
    const sprite = screen.getByTestId("brand-sprite");
    expect(sprite.getAttribute("aria-hidden")).toBe("true");
    const symbols = Array.from(sprite.querySelectorAll("symbol"));
    expect(symbols.length).toBe(BRAND_IDS.length + 1);
    const ids = symbols.map((s) => s.getAttribute("id"));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of BRAND_IDS) expect(ids).toContain(`brand-${id}`);
    expect(ids).toContain("brand-generic");
    for (const s of symbols) expect(s.getAttribute("viewBox"), s.id).toBeTruthy();
  });

  it("is a single string built once at module load", () => {
    expect(typeof SPRITE).toBe("string");
    expect(SPRITE.startsWith("<symbol ")).toBe(true);
    expect((SPRITE.match(/<symbol /g) ?? []).length).toBe(BRAND_IDS.length + 1);
  });
});
