// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { invoke } from "@tauri-apps/api/core";
import EngineReachTiles, { type EngineReachInfo, type TileSwitch } from "./EngineReachTiles";
import { resetUnmappedEngineReports } from "../utils/reportUnmappedEngine";

beforeEach(() => {
  vi.mocked(invoke).mockClear();
  resetUnmappedEngineReports();
});
afterEach(cleanup);

const reach: EngineReachInfo[] = [
  { engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code", reached: true, via_root: "~/.claude/skills", via_store: "~/.agents/skills" },
  { engine_id: 2, engine_key: "gemini", engine_name: "Gemini CLI", reached: true },
  { engine_id: 3, engine_key: "codex", engine_name: "Codex", reached: false, reason: "root_not_linked" },
  // "kiro" now has a mark (src/data/brands.ts); a genuinely unmapped key
  // keeps the "cannot map" case meaningful.
  { engine_id: 4, engine_key: "unmapped-engine", engine_name: "Unmapped Engine", reached: false, reason: "format" },
];

describe("EngineReachTiles", () => {
  it("draws each engine's mark in its tile, the generic for one it cannot map", () => {
    render(<EngineReachTiles reach={reach} />);
    expect(screen.getByTestId("reach-tile-claude_code").querySelector("svg")?.getAttribute("data-brand")).toBe("claude_code");
    expect(screen.getByTestId("reach-tile-gemini").querySelector("svg")?.getAttribute("data-brand")).toBe("gemini");
    expect(screen.getByTestId("reach-tile-codex").querySelector("svg")?.getAttribute("data-brand")).toBe("codex");
    expect(screen.getByTestId("reach-tile-unmapped-engine").querySelector("svg")?.getAttribute("data-brand")).toBe("generic");
    expect(invoke).toHaveBeenCalledWith("report_unmapped_engine", {
      engineKey: "unmappedengine",
      engineName: "Unmapped Engine",
    });
  });

  it("no tile carries a letter any more", () => {
    render(<EngineReachTiles reach={reach} />);
    for (const key of ["claude_code", "gemini", "codex", "unmapped-engine"]) {
      const tile = screen.getByTestId(`reach-tile-${key}`);
      // A letter fallback would show up as a text node sitting next to (or
      // instead of) the mark; assert the tile's only element child is the
      // branded svg and that no text node is present, so a reintroduced
      // letter fails this test instead of slipping past an svg-tolerant check.
      expect(tile.children).toHaveLength(1);
      expect(tile.children[0].tagName).toBe("svg");
      expect(tile.children[0].hasAttribute("data-brand")).toBe(true);
      const hasTextNode = Array.from(tile.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
      );
      expect(hasTextNode).toBe(false);
    }
  });

  it("a reached engine is the mark alone; an unreached one is a dimmed ring", () => {
    render(<EngineReachTiles reach={reach} />);
    const on = screen.getByTestId("reach-tile-claude_code");
    const off = screen.getByTestId("reach-tile-codex");
    expect(on.getAttribute("data-reached")).toBe("true");
    expect(off.getAttribute("data-reached")).toBe("false");
    // Reached carries no chrome at all — no ring, no fill, no dimming.
    expect(on.className).not.toContain("border");
    expect(on.className).not.toContain("bg-fill");
    expect(on.className).not.toContain("opacity");
    // Unreached is an empty slot: the lighter ring token, and dimmed.
    expect(off.className).toContain("border-line");
    expect(off.className).not.toContain("border-line-2");
    expect(off.className).toContain("opacity-40");
  });

  // Seven engines is what a real machine reported on 2026-08-17, and seven
  // tiles are 133px inside a 100px cell that clips nothing — measured in the
  // running window, where the last two marks painted over the Beyond-the-store
  // column and hid the project count. The reached engines are declared THIRD
  // through FIFTH on purpose: a cap that keeps declaration order would show
  // two non-readers and hide a reader, which is the column lying.
  const sevenEngines: EngineReachInfo[] = [
    { engine_id: 1, engine_key: "codex", engine_name: "Codex", reached: false, reason: "root_not_linked" },
    { engine_id: 2, engine_key: "vscode", engine_name: "VS Code", reached: false, reason: "format" },
    { engine_id: 3, engine_key: "claude_code", engine_name: "Claude Code", reached: true },
    { engine_id: 4, engine_key: "gemini", engine_name: "Gemini CLI", reached: true },
    { engine_id: 5, engine_key: "zed", engine_name: "Zed", reached: true },
    { engine_id: 6, engine_key: "opencode", engine_name: "OpenCode", reached: false, reason: "root_not_linked" },
    { engine_id: 7, engine_key: "amp", engine_name: "Amp", reached: false, reason: "root_not_linked" },
  ];

  const tileKeys = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('[data-testid^="reach-tile-"]')).map(
      (t) => t.getAttribute("data-testid") ?? "",
    );

  it("caps at three marks and one chip once more than four engines arrive", () => {
    const { container } = render(<EngineReachTiles reach={sevenEngines} />);
    expect(tileKeys(container)).toHaveLength(3);
    expect(screen.queryByTestId("reach-overflow")).not.toBeNull();
  });

  it("draws all four when exactly four arrive, because four still fit", () => {
    const { container } = render(<EngineReachTiles reach={reach} />);
    expect(tileKeys(container)).toHaveLength(4);
    expect(screen.queryByTestId("reach-overflow")).toBeNull();
  });

  it("puts the engines that reach it first, so a cap never hides a reader", () => {
    const { container } = render(<EngineReachTiles reach={sevenEngines} />);
    expect(tileKeys(container)).toEqual([
      "reach-tile-claude_code",
      "reach-tile-gemini",
      "reach-tile-zed",
    ]);
  });

  it("names every engine the chip stands in for", () => {
    render(<EngineReachTiles reach={sevenEngines} />);
    expect(screen.getByTestId("reach-overflow").getAttribute("aria-label")).toBe(
      "Codex, VS Code, OpenCode and Amp — the panel answers for each one",
    );
  });

  it("keeps the signed tooltip copy", () => {
    render(<EngineReachTiles reach={reach} />);
    expect(screen.getByTestId("reach-tile-claude_code").getAttribute("aria-label")).toBe(
      "Claude Code — reaches it via ~/.claude/skills → ~/.agents/skills",
    );
    expect(screen.getByTestId("reach-tile-gemini").getAttribute("aria-label")).toBe("Gemini CLI — reads it in place");
    expect(screen.getByTestId("reach-tile-codex").getAttribute("aria-label")).toBe("Codex — root not linked");
    expect(screen.getByTestId("reach-tile-unmapped-engine").getAttribute("aria-label")).toBe(
      "Unmapped Engine — cannot read this format",
    );
  });
});

/* Switch mode (T2 of docs/plans/2026-11-25-ia-engines-into-global.md): on
   Global's MCP servers rows a tile whose engine has an item for the row is
   that engine's switch for the server. */
describe("EngineReachTiles — switch mode", () => {
  const tile = (over: Partial<TileSwitch> = {}): TileSwitch => ({
    engineName: "Codex",
    serverName: "alpha",
    file: "~/.codex/config.toml",
    state: "on",
    readOnly: null,
    busy: false,
    onToggle: vi.fn(),
    ...over,
  });
  const only = (key: string, t: TileSwitch | null) => (r: EngineReachInfo) => (r.engine_key === key ? t : null);

  it("a switchable tile is a pressed button named by the action, server and engine both", () => {
    render(<EngineReachTiles reach={reach} switchFor={only("codex", tile())} />);
    const btn = screen.getByRole("button", { name: "Switch alpha off for Codex" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("data-testid")).toBe("reach-tile-codex");
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("an off tile is unpressed, a hollow ring, and names the action that turns it on", () => {
    render(<EngineReachTiles reach={reach} switchFor={only("codex", tile({ state: "off" }))} />);
    const btn = screen.getByRole("button", { name: "Switch alpha on for Codex" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.className).toContain("border-line-2");
    expect(btn.querySelector("svg")?.getAttribute("class") ?? "").toContain("opacity-40");
  });

  it("an on tile is the mark alone, as a reached tile is", () => {
    render(<EngineReachTiles reach={reach} switchFor={only("codex", tile())} />);
    const btn = screen.getByTestId("reach-tile-codex");
    expect(btn.className).not.toContain("border");
    expect(btn.querySelector("svg")?.getAttribute("class") ?? "").not.toContain("opacity");
  });

  it("a click switches it", () => {
    const onToggle = vi.fn();
    render(<EngineReachTiles reach={reach} switchFor={only("codex", tile({ onToggle }))} />);
    fireEvent.click(screen.getByTestId("reach-tile-codex"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("a click does not reach the row under it", () => {
    const rowClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <EngineReachTiles reach={reach} switchFor={only("codex", tile())} />
      </div>
    );
    fireEvent.click(screen.getByTestId("reach-tile-codex"));
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("is keyboard operable: a native, focusable button, so Enter and Space press it", () => {
    // happy-dom does not synthesise a click from a key on a button, so this
    // pins the native element that does, plus focus.
    render(<EngineReachTiles reach={reach} switchFor={only("codex", tile())} />);
    const btn = screen.getByTestId("reach-tile-codex") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it("is disabled while its switch is in flight", () => {
    const onToggle = vi.fn();
    render(<EngineReachTiles reach={reach} switchFor={only("codex", tile({ busy: true, onToggle }))} />);
    const btn = screen.getByTestId("reach-tile-codex") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("a read-only tile is no control, and carries its reason", () => {
    const onToggle = vi.fn();
    render(
      <EngineReachTiles reach={reach} switchFor={only("codex", tile({ readOnly: "managed_by_plugin", onToggle }))} />
    );
    const t = screen.getByTestId("reach-tile-codex");
    expect(t.tagName).not.toBe("BUTTON");
    expect(t.getAttribute("role")).toBeNull();
    expect(t.hasAttribute("tabindex")).toBe(false);
    expect(t.getAttribute("data-read-only")).toBe("true");
    expect(t.getAttribute("aria-label")).toBe(
      "Codex — On. Declared by a plugin. A change here would be undone when the plugin updates."
    );
    fireEvent.click(t);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("a tile with nothing to switch keeps today's display", () => {
    render(<EngineReachTiles reach={reach} switchFor={only("codex", tile())} />);
    const gemini = screen.getByTestId("reach-tile-gemini");
    expect(gemini.tagName).toBe("I");
    expect(gemini.getAttribute("aria-label")).toBe("Gemini CLI — reads it in place");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
