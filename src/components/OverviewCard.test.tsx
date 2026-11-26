// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import OverviewCard, { type OverviewCardProps } from "./OverviewCard";
import type { EngineContext } from "../types/engineContext";
import type { EngineStripFigures } from "./OverviewCard";
import type { StateCounts } from "../utils/linkStateCounts";
import { engineStripHeadline, MEASURE_ALL_CAPTION } from "../utils/switchCopy";

afterEach(cleanup);

function engine(id: string, name: string, tokens: number, counts: { on: number; measured: number; off?: number }): EngineContext {
  return {
    engine_id: id,
    engine_key: id.replace(/-/g, "_"),
    engine_name: name,
    applies: null,
    switches_by_name: false,
    items: [],
    on_count: counts.on,
    off_count: counts.off ?? 0,
    measured_on_count: counts.measured,
    on_tokens_measured: tokens,
  };
}

const CLAUDE_CODE = engine("claude-code", "Claude Code", 13598, { on: 17, measured: 11 });
const CODEX = engine("codex", "Codex", 9951, { on: 9, measured: 9 });
const CLAUDE_AI = engine("claude-ai", "Claude.ai", 0, { on: 3, measured: 0 });

const COUNTS: StateCounts = { linked: 9, drifted: 2, broken: 1, local: 109, total: 121 };

/** Engine figures as ProfilePane builds them for Claude Code today. */
function figures(overrides: Partial<EngineStripFigures> = {}): EngineStripFigures {
  return {
    segments: [
      { key: "Tools", label: "MCP servers", value: "≈ 13,598", measured: true, caption: "11 of 17 servers measured", pressed: false, onSelect: vi.fn() },
      { key: "Skills", label: "Skills", value: "Not measured", measured: false, pressed: false, onSelect: vi.fn() },
      { key: "Rules", label: "Rules", value: "Not measured", measured: false, pressed: false, onSelect: vi.fn() },
      { key: "Subagents", label: "Subagents", value: "Not measured", measured: false, pressed: false, onSelect: vi.fn() },
    ],
    measuring: false,
    onMeasure: vi.fn(),
    measureCaption: MEASURE_ALL_CAPTION,
    ...overrides,
  };
}

function props(overrides: Partial<OverviewCardProps> = {}): OverviewCardProps {
  return {
    // Unsorted, as App holds them: the card ranks.
    engines: [CLAUDE_AI, CODEX, CLAUDE_CODE],
    selectedEngineId: null,
    onSelectEngine: vi.fn(),
    storeTotal: 892,
    linkLegend: { counts: COUNTS, active: null, onFilter: vi.fn() },
    engineFigures: null,
    review: { count: 2, lines: [{ severity: "danger", text: "Target is gone", detail: "CLAUDE.md" }, { severity: "warning", text: "Diverged from its source", detail: "math" }] },
    scan: { scannedAt: Date.now() - 2 * 60_000, scanning: false, onRescan: vi.fn() },
    ...overrides,
  };
}

function engineRows(): HTMLElement {
  return screen.getByRole("group", { name: "Engines" });
}

describe("OverviewCard · Engines", () => {
  it("heads the section 'Engines · tokens every session'", () => {
    render(<OverviewCard {...props()} />);
    expect(screen.getByText("Engines")).toBeTruthy();
    expect(screen.getAllByText("tokens every session").length).toBeGreaterThan(0);
  });

  it("lists All engines first, then the engines by rank, heaviest first", () => {
    render(<OverviewCard {...props()} />);
    const names = within(engineRows())
      .getAllByRole("button")
      .map((b) => b.getAttribute("data-engine-name"));
    expect(names).toEqual(["All engines", "Claude Code", "Codex", "Claude.ai"]);
  });

  it("prints each engine's figure compact, and the store total on All engines", () => {
    render(<OverviewCard {...props()} />);
    const rows = within(engineRows());
    expect(rows.getByRole("button", { name: /^All engines/ }).textContent).toContain("892 assets");
    expect(rows.getByRole("button", { name: /^Claude Code/ }).textContent).toContain("≈ 13.6k");
    expect(rows.getByRole("button", { name: /^Codex/ }).textContent).toContain("≈ 10.0k");
    expect(rows.getByRole("button", { name: /^Claude\.ai/ }).textContent).toContain("Not measured");
  });

  it("picks an engine, or All engines, on a click", () => {
    const p = props();
    render(<OverviewCard {...p} />);
    fireEvent.click(within(engineRows()).getByRole("button", { name: /^Codex/ }));
    expect(p.onSelectEngine).toHaveBeenCalledWith("codex");
    fireEvent.click(within(engineRows()).getByRole("button", { name: /^All engines/ }));
    expect(p.onSelectEngine).toHaveBeenCalledWith(null);
  });

  it("marks the selected row aria-current, and only that one", () => {
    render(<OverviewCard {...props({ selectedEngineId: "codex", engineFigures: figures() })} />);
    const current = within(engineRows())
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "true");
    expect(current.map((b) => b.getAttribute("data-engine-name"))).toEqual(["Codex"]);
  });

  it("marks All engines current when no engine is picked", () => {
    render(<OverviewCard {...props()} />);
    expect(within(engineRows()).getByRole("button", { name: /^All engines/ }).getAttribute("aria-current")).toBe("true");
  });

  it("draws no Engines head before the first scan has listed any (Review Focus 1)", () => {
    render(<OverviewCard {...props({ engines: [] })} />);
    expect(screen.queryByText("Engines")).toBeNull();
    expect(screen.queryByRole("group", { name: "Engines" })).toBeNull();
    // The store section and the actions are still there.
    expect(screen.getByText("The global store")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Rescan/ })).toBeTruthy();
  });
});

describe("OverviewCard · the chosen engine", () => {
  it("shows the engine's head, its headline figure, Measure all and four kind rows", () => {
    const fig = figures();
    render(<OverviewCard {...props({ selectedEngineId: "claude-code", engineFigures: fig })} />);
    const section = screen.getByRole("region", { name: "Claude Code" });
    const s = within(section);
    expect(s.getByText("11 of 17 servers measured")).toBeTruthy();
    // The headline, and the MCP servers row: Phase 1 measures MCP alone, so
    // the two figures are one.
    expect(s.getAllByText(engineStripHeadline(CLAUDE_CODE, "Claude Code").figure!)).toHaveLength(2);
    expect(s.getByText("tokens every session")).toBeTruthy();
    const measure = s.getByRole("button", { name: "Measure all" });
    expect(measure.getAttribute("title")).toBe(MEASURE_ALL_CAPTION);
    fireEvent.click(measure);
    expect(fig.onMeasure).toHaveBeenCalledTimes(1);

    const kinds = within(s.getByTestId("overview-kinds")).getAllByRole("button");
    expect(kinds.map((k) => k.getAttribute("data-kind"))).toEqual(["Tools", "Skills", "Rules", "Subagents"]);
    expect(kinds.filter((k) => k.textContent?.includes("Not measured"))).toHaveLength(3);
    expect(kinds[0].textContent).toContain("MCP servers");
    expect(kinds[0].textContent).toContain("≈ 13,598");
    // The one measured kind fills its track; the rest are bare.
    expect((kinds[0].querySelector("[role='img']")!.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(kinds[1].querySelector("[role='img']")!.children).toHaveLength(0);
  });

  it("opens a kind's tab from its row", () => {
    const fig = figures();
    render(<OverviewCard {...props({ selectedEngineId: "claude-code", engineFigures: fig })} />);
    fireEvent.click(screen.getByRole("button", { name: /^Skills/ }));
    expect(fig.segments[1].onSelect).toHaveBeenCalledTimes(1);
  });

  it("says Measuring… while it measures, and draws no Measure all where there is nothing to measure", () => {
    const { rerender } = render(
      <OverviewCard {...props({ selectedEngineId: "claude-code", engineFigures: figures({ measuring: true }) })} />
    );
    expect((screen.getByRole("button", { name: "Measuring…" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<OverviewCard {...props({ selectedEngineId: "claude-code", engineFigures: figures({ onMeasure: undefined }) })} />);
    expect(screen.queryByRole("button", { name: /^Measur/ })).toBeNull();
  });

  it("says Not measured in place of the figure for an engine with none", () => {
    render(<OverviewCard {...props({ selectedEngineId: "claude-ai", engineFigures: figures() })} />);
    const s = within(screen.getByRole("region", { name: "Claude.ai" }));
    expect(s.queryByText("tokens every session")).toBeNull();
    expect(s.getAllByText("Not measured").length).toBeGreaterThan(0);
  });

  it("leaves the store section and its legend out", () => {
    render(<OverviewCard {...props({ selectedEngineId: "claude-code", engineFigures: figures() })} />);
    expect(screen.queryByText("The global store")).toBeNull();
    expect(screen.queryByRole("button", { name: /local only/ })).toBeNull();
  });
});

describe("OverviewCard · All engines (round 14 q2)", () => {
  it("shows 'The global store · {n} assets' and the link-state legend", () => {
    render(<OverviewCard {...props()} />);
    const s = within(screen.getByRole("region", { name: "The global store" }));
    expect(s.getByText("892 assets")).toBeTruthy();
    expect(s.getByRole("img", { name: "9 linked, 2 drifted, 1 broken, 109 local only" })).toBeTruthy();
    for (const label of ["linked", "drifted", "broken", "local only"]) {
      expect(s.getByRole("button", { name: new RegExp(`${label}$`) })).toBeTruthy();
    }
  });

  it("filters the list from the legend, and a second click clears it", () => {
    const onFilter = vi.fn();
    const { rerender } = render(<OverviewCard {...props({ linkLegend: { counts: COUNTS, active: null, onFilter } })} />);
    fireEvent.click(screen.getByRole("button", { name: /drifted$/ }));
    expect(onFilter).toHaveBeenLastCalledWith("drifted");
    rerender(<OverviewCard {...props({ linkLegend: { counts: COUNTS, active: "drifted", onFilter } })} />);
    expect(screen.getByRole("button", { name: /drifted$/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /drifted$/ }));
    expect(onFilter).toHaveBeenLastCalledWith(null);
  });
});

describe("OverviewCard · actions", () => {
  it("opens the review's FindingPopover from Needs review and its count", () => {
    render(<OverviewCard {...props()} />);
    const row = screen.getByRole("button", { name: /^Needs review/ });
    expect(row.textContent).toContain("2");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const pop = screen.getByRole("dialog", { name: "Needs review 2" });
    expect(within(pop).getByText("Target is gone")).toBeTruthy();
  });

  it("draws no Needs review row with nothing to review", () => {
    render(<OverviewCard {...props({ review: null })} />);
    expect(screen.queryByRole("button", { name: /^Needs review/ })).toBeNull();
    cleanup();
    render(<OverviewCard {...props({ review: { count: 0, lines: [] } })} />);
    expect(screen.queryByRole("button", { name: /^Needs review/ })).toBeNull();
  });

  it("rescans, with the scan stamp beside it, and says Scanning while one runs", () => {
    const p = props();
    const { rerender } = render(<OverviewCard {...p} />);
    const rescan = screen.getByRole("button", { name: /^Rescan/ });
    expect(rescan.textContent).toContain("Scanned 2 min ago");
    fireEvent.click(rescan);
    expect(p.scan.onRescan).toHaveBeenCalledTimes(1);
    rerender(<OverviewCard {...props({ scan: { ...p.scan, scanning: true } })} />);
    expect((screen.getByRole("button", { name: /^Scanning/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says Not scanned yet before the first scan", () => {
    render(<OverviewCard {...props({ scan: { scannedAt: null, scanning: false, onRescan: vi.fn() } })} />);
    expect(screen.getByRole("button", { name: /^Rescan/ }).textContent).toContain("Not scanned yet");
  });
});

describe("OverviewCard · a narrow window (Review Focus 5)", () => {
  // happy-dom lays nothing out (verification.md), so wrapping cannot be
  // measured here. This is a class contract: the names truncate and the
  // values never wrap. The 384px inspector is checked in the running app.
  it("truncates names and keeps every value on one line", () => {
    render(
      <div style={{ width: 384 }}>
        <OverviewCard {...props({ engines: [engine("long", "A very long engine name that cannot fit", 120, { on: 1, measured: 1 }), CODEX] })} />
      </div>
    );
    const rows = within(engineRows()).getAllByRole("button");
    for (const row of rows) {
      expect(row.querySelector("[data-cell='name']")?.className).toContain("truncate");
      expect(row.querySelector("[data-cell='value']")?.className).toContain("whitespace-nowrap");
    }
  });

  it("does the same for the kind rows", () => {
    render(<OverviewCard {...props({ selectedEngineId: "claude-code", engineFigures: figures() })} />);
    for (const row of within(screen.getByTestId("overview-kinds")).getAllByRole("button")) {
      expect(row.querySelector("[data-cell='name']")?.className).toContain("truncate");
      expect(row.querySelector("[data-cell='value']")?.className).toContain("whitespace-nowrap");
    }
  });
});

/* Task 2 of docs/plans/2026-11-26-global-list.md: T3's size and anatomy
   (ThreadDetailsCard, ThreadDetailsSection, ThreadDetailsUsage), drawn in
   Hanger's tokens, matched against approved-HI.png. happy-dom lays nothing
   out, so these are class contracts; the sizes are a screenshot claim. */
describe("OverviewCard · T3's size and anatomy (Task 2)", () => {
  it("is a 280px frosted card: the page token at 86%, a backdrop blur, a line border, the plane radius, no elevation", () => {
    render(<OverviewCard {...props()} />);
    const cls = screen.getByTestId("overview-card").className.split(/\s+/);
    for (const c of ["w-[280px]", "rounded-plane", "border", "border-line", "bg-page/86", "backdrop-blur-frost"]) expect(cls).toContain(c);
    expect(cls.some((c) => c.startsWith("shadow"))).toBe(false);
  });

  it("heads each section in 11px muted type, 32px tall", () => {
    render(<OverviewCard {...props({ selectedEngineId: "claude-code", engineFigures: figures() })} />);
    const heads = Array.from(document.querySelectorAll("[data-section-head]"));
    expect(heads.length).toBeGreaterThan(1);
    for (const h of heads) for (const c of ["min-h-8", "text-micro", "font-medium", "text-ink-3"]) expect(h.className.split(/\s+/)).toContain(c);
  });

  it("draws the engines as 32px rows with an 8px radius, and no bar", () => {
    render(<OverviewCard {...props()} />);
    for (const row of within(engineRows()).getAllByRole("button")) {
      for (const c of ["h-8", "rounded-control"]) expect(row.className.split(/\s+/)).toContain(c);
      expect(row.querySelector("[role='img']")).toBeNull();
    }
  });

  it("draws the kinds as 24px meter rows: a 3px bar, and an end tick on a measured one", () => {
    render(<OverviewCard {...props({ selectedEngineId: "claude-code", engineFigures: figures() })} />);
    const rows = within(screen.getByTestId("overview-kinds")).getAllByRole("button");
    for (const row of rows) {
      expect(row.className.split(/\s+/)).toContain("h-6");
      const meter = row.querySelector("[role='img']") as HTMLElement;
      expect(meter.className.split(/\s+/)).toContain("h-[3px]");
    }
    const mcp = rows.find((r) => r.getAttribute("data-kind") === "Tools")!;
    expect(mcp.querySelector("[data-meter-tick]")).not.toBeNull();
    const skills = rows.find((r) => r.getAttribute("data-kind") === "Skills")!;
    expect(skills.querySelector("[data-meter-tick]")).toBeNull();
  });

  it("draws Needs review and Rescan as 32px rows with an 8px radius", () => {
    render(<OverviewCard {...props()} />);
    for (const name of [/^Needs review/, /^Rescan/]) {
      const row = screen.getByRole("button", { name });
      for (const c of ["h-8", "rounded-control"]) expect(row.className.split(/\s+/)).toContain(c);
    }
  });

  it("carries no pin, with engines or without", () => {
    render(<OverviewCard {...props()} />);
    expect(screen.queryByRole("button", { name: /pin/i })).toBeNull();
    cleanup();
    render(<OverviewCard {...props({ engines: [] })} />);
    expect(screen.queryByRole("button", { name: /pin/i })).toBeNull();
  });
});
