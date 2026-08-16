// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { invoke } from "@tauri-apps/api/core";
import BrandIcon from "./BrandIcon";
import { resetUnmappedEngineReports } from "../utils/reportUnmappedEngine";

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  resetUnmappedEngineReports();
});
afterEach(cleanup);

const useHref = (container: HTMLElement) => container.querySelector("use")?.getAttribute("href");

describe("BrandIcon", () => {
  it("draws the brand's symbol for a key, a host id, a scope agent id and a display name", () => {
    for (const key of ["claude_code", "claude-code", "claude", "Claude Code"]) {
      const { container, unmount } = render(<BrandIcon engineKey={key} />);
      expect(useHref(container), key).toBe("#brand-claude_code");
      expect(container.querySelector("svg")?.getAttribute("data-brand")).toBe("claude_code");
      unmount();
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("is decorative and sized by the size prop, default 12", () => {
    const { container } = render(<BrandIcon engineKey="codex" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("width")).toBe("12");
    expect(svg.getAttribute("height")).toBe("12");
    const big = render(<BrandIcon engineKey="codex" size={16} className="mt-1" />);
    const bigSvg = big.container.querySelector("svg")!;
    expect(bigSvg.getAttribute("width")).toBe("16");
    expect(bigSvg.getAttribute("class")).toContain("mt-1");
  });

  it("renders nothing for the any-agent values and reports nothing", () => {
    for (const key of [null, undefined, "", "none", "unknown"]) {
      const { container, unmount } = render(<BrandIcon engineKey={key} />);
      expect(container.querySelector("svg"), String(key)).toBeNull();
      unmount();
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("draws the generic mark for an unmapped engine and reports it once", () => {
    const a = render(<BrandIcon engineKey="kiro" engineName="Kiro" />);
    const b = render(<BrandIcon engineKey="kiro" engineName="Kiro" />);
    expect(useHref(a.container)).toBe("#brand-generic");
    expect(a.container.querySelector("svg")?.getAttribute("data-brand")).toBe("generic");
    expect(useHref(b.container)).toBe("#brand-generic");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("report_unmapped_engine", { engineKey: "kiro", engineName: "Kiro" });
  });

  it("places itself with x/y when asked (for use inside another svg)", () => {
    const { container } = render(
      <svg>
        <BrandIcon engineKey="gemini" x={13} y={12} />
      </svg>,
    );
    const inner = container.querySelector("svg svg")!;
    expect(inner.getAttribute("x")).toBe("13");
    expect(inner.getAttribute("y")).toBe("12");
    expect(inner.querySelector("use")?.getAttribute("href")).toBe("#brand-gemini");
  });

  it("draws both marks for a brand with a dark variant, letting CSS choose", () => {
    const { container } = render(<BrandIcon engineKey="codex" />);
    const hrefs = Array.from(container.querySelectorAll("use")).map((u) => u.getAttribute("href"));
    expect(hrefs).toEqual(["#brand-codex", "#brand-codex-dark"]);
    const [light, dark] = Array.from(container.querySelectorAll("use"));
    expect(light.getAttribute("class")).toContain("brand-light-only");
    expect(dark.getAttribute("class")).toContain("brand-dark-only");
    // Still one svg, still one data-brand — call sites and their tests are untouched.
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelector("svg")?.getAttribute("data-brand")).toBe("codex");
  });

  it("draws a single use for a brand with no dark variant", () => {
    const { container } = render(<BrandIcon engineKey="claude_code" />);
    const hrefs = Array.from(container.querySelectorAll("use")).map((u) => u.getAttribute("href"));
    expect(hrefs).toEqual(["#brand-claude_code"]);
  });
});
