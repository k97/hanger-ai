import { describe, it, expect } from "vitest";
import { BRANDS, BRAND_IDS, GENERIC_MARK, normaliseBrandKey, resolveBrand } from "./brands";
import type { BrandId } from "./brands";

/** Spec §4, "Also resolves from" — every identifier the UI can hold. */
const ALIASES: Record<BrandId, string[]> = {
  claude_code: ["claude_code", "claude-code", "claude", "Claude Code"],
  codex: ["codex", "Codex", "OpenAI Codex"],
  gemini: ["gemini", "gemini-cli", "geminicli", "antigravity", "Gemini CLI", "Gemini / Antigravity"],
  claude_desktop: ["claude_desktop", "claude-desktop", "Claude Desktop"],
  claude_ai: ["claude_ai", "claude-ai", "Claude.ai"],
  vscode: ["vscode", "VS Code", "Visual Studio Code"],
  cursor: ["cursor", "Cursor"],
  windsurf: ["windsurf", "Windsurf"],
  zed: ["zed", "Zed", "Zed Editor"],
  copilot: ["copilot", "github-copilot", "GitHub Copilot"],
  opencode: ["opencode", "OpenCode"],
};

/* Anywhere, not just the root: lobe's mono files put fill="currentColor" on
   the <svg>, but the vendored zed.svg puts it on the <path> inside. Both are
   ink marks and both follow --ink through <use>. */
const usesCurrentColor = (svg: string) => svg.includes("currentColor");

describe("BRANDS", () => {
  it("has exactly the eleven brands of the spec, each with a real svg", () => {
    expect([...BRAND_IDS].sort()).toEqual(
      ["claude_ai", "claude_code", "claude_desktop", "codex", "copilot", "cursor", "gemini", "opencode", "vscode", "windsurf", "zed"],
    );
    for (const id of BRAND_IDS) {
      expect(BRANDS[id].svg, id).toMatch(/^\s*<svg\b/);
      expect(BRANDS[id].svg, id).toMatch(/viewBox="/);
    }
  });

  it("marks ink files as ink and colour files as colour, by whether they use currentColor", () => {
    for (const id of BRAND_IDS) {
      expect(BRANDS[id].ink, id).toBe(usesCurrentColor(BRANDS[id].svg));
    }
    expect(BRANDS.cursor.ink).toBe(true);
    expect(BRANDS.zed.ink).toBe(true); // currentColor on its <path>, not its root
    expect(BRANDS.codex.ink).toBe(false);
    expect(BRANDS.vscode.source).toBe("vendored");
    expect(BRANDS.zed.source).toBe("vendored");
    expect(BRANDS.claude_code.source).toBe("lobe");
  });

  it("the generic mark is ink and not a brand", () => {
    expect(GENERIC_MARK.ink).toBe(true);
    expect(usesCurrentColor(GENERIC_MARK.svg)).toBe(true);
    expect((BRAND_IDS as readonly string[]).includes("generic")).toBe(false);
  });

  it("gives Codex a dark-mode mark, because its colour file paints a white plate", () => {
    expect(BRANDS.codex.darkSvg).toBeTypeOf("string");
    expect(BRANDS.codex.darkSvg).toMatch(/^\s*<svg\b/);
    // The dark mark is the vendor's own monochrome file: it follows --ink.
    expect(BRANDS.codex.darkSvg).toContain("currentColor");
    // The light mark keeps the plate; we do not edit vendor artwork.
    expect(BRANDS.codex.svg).toContain('fill="#fff"');
  });

  it("gives no other brand a dark variant — none of them needs one", () => {
    const withDark = BRAND_IDS.filter((id) => BRANDS[id].darkSvg !== undefined);
    expect(withDark).toEqual(["codex"]);
  });
});

describe("normaliseBrandKey", () => {
  it("lowercases and keeps only letters and digits", () => {
    expect(normaliseBrandKey("Gemini / Antigravity")).toBe("geminiantigravity");
    expect(normaliseBrandKey("claude-code")).toBe("claudecode");
    expect(normaliseBrandKey("Claude.ai")).toBe("claudeai");
    expect(normaliseBrandKey("  ")).toBe("");
  });
});

describe("resolveBrand", () => {
  it("resolves every alias in the spec table", () => {
    for (const [id, aliases] of Object.entries(ALIASES) as [BrandId, string[]][]) {
      for (const alias of aliases) expect(resolveBrand(alias), alias).toBe(id);
    }
  });

  it("returns undefined for the any-agent values and for unknown ids", () => {
    for (const v of [null, undefined, "", "   ", "none", "unknown", "kiro", "trae", "/Users/k/.claude/agents/x.md"]) {
      expect(resolveBrand(v), String(v)).toBeUndefined();
    }
  });
});
