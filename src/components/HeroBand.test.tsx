// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import HeroBand, { type HeroBandRow } from "./HeroBand";

afterEach(cleanup);

const rows: HeroBandRow[] = [
  { key: "claude_code", engineKey: "claude_code", engineName: "Claude Code", secondary: "10 servers", value: 131, word: "tools" },
  { key: "claude_ai", engineKey: "claude_ai", engineName: "Claude.ai", secondary: "7 servers", value: null, word: "can't be asked" },
  { key: "vscode", engineKey: "vscode", engineName: "VS Code", secondary: "1 server", value: 0, word: "tools" },
];

describe("HeroBand", () => {
  it("collapsed: the label, then every row as mark and value only — no names, no more-count", () => {
    render(<HeroBand label="By host" open={false} onToggle={vi.fn()} rows={rows} />);
    const toggle = screen.getByTestId("hero-band-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("By host");
    const collapsed = screen.getByTestId("hero-band-collapsed");
    expect(collapsed.textContent).toContain("131");
    expect(collapsed.textContent).toContain("—");
    expect(collapsed.textContent).toContain("0");
    expect(collapsed.textContent).not.toContain("Claude Code");
    expect(collapsed.textContent).not.toMatch(/more/);
    expect(screen.queryByTestId("hero-band-row-claude_code")).toBeNull();
  });

  it("open: one row per entry with name, secondary, value and word; null is a dash with its own word", () => {
    render(<HeroBand label="By host" open onToggle={vi.fn()} rows={rows} note="A tool counts once per host that carries it." />);
    expect(screen.getByTestId("hero-band-toggle").getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByTestId("hero-band-collapsed")).toBeNull();
    expect(screen.getByText("A tool counts once per host that carries it.")).toBeTruthy();
    const cc = screen.getByTestId("hero-band-row-claude_code");
    expect(cc.textContent).toContain("Claude Code");
    expect(cc.textContent).toContain("10 servers");
    expect(cc.textContent).toContain("131");
    expect(cc.textContent).toContain("tools");
    const ai = screen.getByTestId("hero-band-row-claude_ai");
    expect(ai.textContent).toContain("—");
    expect(ai.textContent).toContain("can't be asked");
    const vs = screen.getByTestId("hero-band-row-vscode");
    expect(vs.textContent).toContain("0");
  });

  it("open rows are the key-value contract without the card: no rounded, no bg, hairlines between", () => {
    render(<HeroBand label="By host" open onToggle={vi.fn()} rows={rows} />);
    const cc = screen.getByTestId("hero-band-row-claude_code");
    expect(cc.className).toContain("border-t");
    expect(cc.className).not.toMatch(/rounded|bg-/);
  });

  it("the toggle calls onToggle", () => {
    const onToggle = vi.fn();
    render(<HeroBand label="By engine" open={false} onToggle={onToggle} rows={rows} />);
    fireEvent.click(screen.getByTestId("hero-band-toggle"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders the foot slot only when open and given", () => {
    const { rerender } = render(<HeroBand label="By engine" open={false} onToggle={vi.fn()} rows={rows} foot={<span>1 nested repo counts towards this row</span>} />);
    expect(screen.queryByTestId("hero-band-foot")).toBeNull();
    rerender(<HeroBand label="By engine" open onToggle={vi.fn()} rows={rows} foot={<span>1 nested repo counts towards this row</span>} />);
    expect(screen.getByTestId("hero-band-foot").textContent).toContain("nested repo");
  });
});
