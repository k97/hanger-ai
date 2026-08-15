// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import EngineLabel from "./EngineLabel";

afterEach(cleanup);

describe("EngineLabel", () => {
  it("puts the mark before the label with the shell's gap", () => {
    render(<EngineLabel engineKey="codex">Codex</EngineLabel>);
    const label = screen.getByText("Codex");
    const wrapper = label.parentElement!;
    expect(wrapper.className).toContain("inline-flex");
    expect(wrapper.className).toContain("gap-1.5");
    expect(wrapper.querySelector("svg")?.getAttribute("data-brand")).toBe("codex");
    expect(wrapper.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  });

  it("shows only the label for any-agent", () => {
    render(<EngineLabel engineKey={null}>Any agent</EngineLabel>);
    const wrapper = screen.getByText("Any agent").parentElement!;
    expect(wrapper.querySelector("svg")).toBeNull();
  });

  it("passes size and className through", () => {
    render(
      <EngineLabel engineKey="cursor" size={14} className="text-ink-2">
        Cursor
      </EngineLabel>,
    );
    const wrapper = screen.getByText("Cursor").parentElement!;
    expect(wrapper.className).toContain("text-ink-2");
    expect(wrapper.querySelector("svg")?.getAttribute("width")).toBe("14");
  });
});
