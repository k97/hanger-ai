// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import SearchPalette, { renderSnippet, placeLabel, type SearchHit } from "./SearchPalette";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => ({ hits: [], total: 0 })) }));

const MARK_OPEN = "";
const MARK_CLOSE = "";

const skillHit: SearchHit = {
  kind: "skill", id: "/home/u/.claude/skills/deploy-helper", path: "/home/u/.claude/skills/deploy-helper",
  name: "deploy-helper", server: null, place: "global",
  snippet: `Before you ${MARK_OPEN}deploy${MARK_CLOSE}, read this.`, rank: -3,
};
const toolHit: SearchHit = {
  kind: "mcp_tool", id: "/home/u/.claude.json:spades", path: "/home/u/.claude.json",
  name: "set_volume", server: "spades", place: "/Users/u/Work/proj",
  snippet: `Adjust the ${MARK_OPEN}loudness${MARK_CLOSE}`, rank: -2,
};

const scanned = new Date("2026-08-27T10:00:00Z");

describe("SearchPalette", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async () => ({ hits: [skillHit, toolHit], total: 2 }));
  });
  afterEach(() => cleanup());

  it("renders nothing while closed and a dialog named Search when open, with focus in the input", () => {
    const { rerender } = render(<SearchPalette open={false} scannedAt={scanned} onClose={() => {}} onPick={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<SearchPalette open={true} scannedAt={scanned} onClose={() => {}} onPick={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Search" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Search assets"));
  });

  it("queries the backend with the typed text and renders hits in rank order, each with its kind's glyph", async () => {
    render(<SearchPalette open={true} scannedAt={scanned} onClose={() => {}} onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText("Search assets"), { target: { value: "deploy" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("search_assets", { query: "deploy", limit: 50 }));
    expect(await screen.findByText("deploy-helper")).toBeTruthy();
    // Backend order, no headings (Karthik's ruling, 2026-08-28).
    const items = screen.getAllByRole("option");
    expect(items.map((el) => el.getAttribute("data-kind"))).toEqual(["skill", "mcp_tool"]);
    expect(screen.queryByText("Skills")).toBeNull();
    expect(screen.queryByText("Tools")).toBeNull();
    // Each row leads with its kind's glyph, named for the reader.
    expect(items[0].querySelector('[data-glyph="skill"]')).toBeTruthy();
    expect(items[1].querySelector('[data-glyph="mcp_tool"]')).toBeTruthy();
    // The tool row names its server and its place.
    expect(screen.getByText("spades")).toBeTruthy();
    expect(screen.getByText("proj")).toBeTruthy();
    expect(screen.getByText("Global")).toBeTruthy();
  });

  it("emphasises the matched run and never shows the markers", async () => {
    render(<SearchPalette open={true} scannedAt={scanned} onClose={() => {}} onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText("Search assets"), { target: { value: "deploy" } });
    const mark = await screen.findByText("deploy", { selector: "mark" });
    expect(mark.tagName).toBe("MARK");
    expect(document.body.textContent).not.toContain(MARK_OPEN);
    expect(document.body.textContent).not.toContain(MARK_CLOSE);
  });

  it("picks on click and on Enter", async () => {
    const onPick = vi.fn();
    render(<SearchPalette open={true} scannedAt={scanned} onClose={() => {}} onPick={onPick} />);
    const input = screen.getByLabelText("Search assets");
    fireEvent.change(input, { target: { value: "deploy" } });
    await screen.findByText("deploy-helper");
    // cmdk selects what you click, so Enter comes first: it fires on
    // whatever cmdk defaults to (the first item) before a click moves
    // selection off it.
    await waitFor(() => expect(screen.getByText("deploy-helper").closest("[cmdk-item]")?.getAttribute("data-selected")).toBe("true"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(skillHit);
    fireEvent.click(screen.getByText("set_volume"));
    expect(onPick).toHaveBeenCalledWith(toolHit);
    expect(onPick).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape and on a pointerdown on the wash, not on the panel", () => {
    const onClose = vi.fn();
    render(<SearchPalette open={true} scannedAt={scanned} onClose={onClose} onPick={() => {}} />);
    fireEvent.pointerDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId("search-wash"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("opts the input out of the global focus ring, and drops the rule beneath the input row (class contract only — happy-dom paints nothing, so this pins the classes, not the pixels)", () => {
    render(<SearchPalette open={true} scannedAt={scanned} onClose={() => {}} onPick={() => {}} />);
    const input = screen.getByLabelText("Search assets");
    expect(input.className).toContain("focus-visible:outline-none");
    expect(input.parentElement?.className).not.toContain("border-b");
  });

  it("says nothing is a finding before the first scan, and does not query", async () => {
    render(<SearchPalette open={true} scannedAt={null} onClose={() => {}} onPick={() => {}} />);
    expect(screen.getByText("Results show up here once the first scan finishes.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search assets"), { target: { value: "deploy" } });
    await new Promise((r) => setTimeout(r, 150));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("shows the hint on an empty query and the finding on an empty answer", async () => {
    vi.mocked(invoke).mockImplementation(async () => ({ hits: [], total: 0 }));
    render(<SearchPalette open={true} scannedAt={scanned} onClose={() => {}} onPick={() => {}} />);
    expect(screen.getByText("Type to search names and what's inside.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search assets"), { target: { value: "zzz" } });
    expect(await screen.findByText("Nothing matches “zzz”.")).toBeTruthy();
  });

  it("shows the hint, not a finding, when the backend rejects", async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error("Search failed"));
    render(<SearchPalette open={true} scannedAt={scanned} onClose={() => {}} onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText("Search assets"), { target: { value: "deploy" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("search_assets", { query: "deploy", limit: 50 }));
    await waitFor(() => expect(screen.queryByText("Nothing matches “deploy”.")).toBeNull());
    expect(screen.getByText("Type to search names and what's inside.")).toBeTruthy();
  });

  it("drops a stale answer that lands after a newer query", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    vi.mocked(invoke)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockImplementationOnce(async () => ({ hits: [toolHit], total: 1 }));
    render(<SearchPalette open={true} scannedAt={scanned} onClose={() => {}} onPick={() => {}} />);
    const input = screen.getByLabelText("Search assets");
    fireEvent.change(input, { target: { value: "dep" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "loud" } });
    await screen.findByText("set_volume");
    resolveFirst({ hits: [skillHit], total: 1 });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("deploy-helper")).toBeNull();
  });
});

describe("renderSnippet / placeLabel", () => {
  it("splits on the markers", () => {
    render(<p>{renderSnippet(`a ${MARK_OPEN}b${MARK_CLOSE} c`)}</p>);
    expect(screen.getByText("b").tagName).toBe("MARK");
  });
  it("labels global and shortens a project root to its basename", () => {
    expect(placeLabel("global")).toBe("Global");
    expect(placeLabel("/Users/u/Work/proj")).toBe("proj");
  });
});
