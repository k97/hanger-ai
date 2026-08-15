import { describe, it, expect } from "vitest";
import { prefixIds, toSymbol } from "./svgSymbol";
import { BRANDS } from "../data/brands";

describe("prefixIds", () => {
  it("rewrites ids and every kind of reference to them", () => {
    const input =
      `<defs><linearGradient id="g"/><mask id="a"/></defs>` +
      `<path fill="url(#g)" mask="url(#a)"/><use href="#g"/><use xlink:href="#a"/>` +
      `<g style="mask:url(#a)"/>`;
    expect(prefixIds(input, "brand-x-")).toBe(
      `<defs><linearGradient id="brand-x-g"/><mask id="brand-x-a"/></defs>` +
        `<path fill="url(#brand-x-g)" mask="url(#brand-x-a)"/><use href="#brand-x-g"/><use xlink:href="#brand-x-a"/>` +
        `<g style="mask:url(#brand-x-a)"/>`,
    );
  });
});

describe("toSymbol", () => {
  it("turns an ink lobe file into a symbol that keeps currentColor on the root", () => {
    const s = toSymbol("cursor", BRANDS.cursor.svg);
    expect(s.startsWith(`<symbol id="brand-cursor" viewBox="0 0 24 24"`)).toBe(true);
    expect(s).toMatch(/^<symbol [^>]*\sfill="currentColor"/);
    expect(s).toMatch(/^<symbol [^>]*\sfill-rule="evenodd"/);
    expect(s).not.toMatch(/<title>/);
    expect(s).not.toMatch(/\swidth="1em"|\sheight="1em"|\sstyle="flex/);
    expect(s.endsWith("</symbol>")).toBe(true);
    // The path data is the file's, untouched.
    const d = /d="([^"]+)"/.exec(BRANDS.cursor.svg)![1];
    expect(s).toContain(`d="${d}"`);
  });

  it("turns a colour lobe file into a symbol without a root fill and with prefixed gradient ids", () => {
    const s = toSymbol("codex", BRANDS.codex.svg);
    expect(s.startsWith(`<symbol id="brand-codex" viewBox="0 0 24 24">`)).toBe(true);
    expect(s).toContain(`id="brand-codex-lobe-icons-codex-_R_0_"`);
    expect(s).toContain(`fill="url(#brand-codex-lobe-icons-codex-_R_0_)"`);
    expect(s).toContain(`fill="#fff"`); // the white tile is the vendor's, kept
  });

  it("carries a vendored mask+filter file through with its ids prefixed and viewBox kept", () => {
    const s = toSymbol("vscode", BRANDS.vscode.svg);
    expect(s.startsWith(`<symbol id="brand-vscode" viewBox="0 0 128 128">`)).toBe(true);
    for (const x of ["a", "b", "c", "d"]) {
      expect(s).toContain(`id="brand-vscode-${x}"`);
      expect(s).toContain(`url(#brand-vscode-${x})`);
      expect(s).not.toMatch(new RegExp(`\\bid="${x}"`));
    }
  });

  it("two files that both use id=a do not collide once joined", () => {
    const joined = toSymbol("vscode", BRANDS.vscode.svg) + toSymbol("zed", BRANDS.zed.svg);
    const ids = [...joined.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("brand-zed-a");
    expect(ids).toContain("brand-vscode-a");
  });

  it("refuses a file with no viewBox or no root", () => {
    expect(() => toSymbol("x", `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`)).toThrow(/viewBox/);
    expect(() => toSymbol("x", `<div/>`)).toThrow(/<svg>/);
  });
});
