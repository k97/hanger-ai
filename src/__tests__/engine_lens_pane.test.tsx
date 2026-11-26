// @vitest-environment happy-dom
/** Global seen by one engine, the pane's share (Phase 1 of
 *  docs/plans/2026-11-25-ia-global-by-engine.md). The engine is picked in
 *  the overview card's Engines group (the chips until Task 7 of
 *  docs/plans/2026-11-26-overview-card.md), which replaced the "By engine"
 *  band; with an engine
 *  picked the list keeps what that engine reaches — a skill by its backend
 *  `reached` verdict, an MCP server by its registrations in the engine's
 *  context, as the band's filter did — and "Not loaded by {engine}" lists the
 *  rest the backend says it does not reach, with the reason. Counts stay the
 *  backend's: a section header drops its store figure while filtered rather
 *  than show one the rows below contradict, and the group has none.
 *
 *  And the card's engine section (the strip's engine mode until Task 7):
 *  with an engine picked the card shows that engine's budget by kind
 *  instead of the store's link-health legend — only MCP is measured in
 *  Phase 1 — each kind row opens its kind's tab, Measure all asks that
 *  engine alone, and each MCP row carries that engine's figure or its
 *  read-only reason. */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { useState, type ComponentProps } from "react";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import ProfilePane from "../components/ProfilePane";
import EngineReachTiles, { type EngineReachInfo } from "../components/EngineReachTiles";
import { engineBandFigures, MEASURE_ALL_CAPTION, readOnlyLine } from "../utils/switchCopy";
import McpServerDetail, { type McpServerView } from "../components/McpServerDetail";
import type { McpSwitch } from "../hooks/useMcpSwitch";
import type { ContextItem, EngineContext, EngineListEntry, KeptOff } from "../types/engineContext";
import type { McpServerRow } from "../utils/serverRows";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), openPath: vi.fn(), revealItemInDir: vi.fn() }));

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async () => null);
});
/** Global's overview card draws only into a cap slot, so the tests that
 *  read it hand the pane one and open the card from its button. */
const capSlots: HTMLElement[] = [];
const slots = () => {
  const cap = document.createElement("div");
  document.body.appendChild(cap);
  capSlots.push(cap);
  return { overviewSlots: { cap, inspector: null } };
};
const openOverview = () => {
  fireEvent.click(screen.getByLabelText("Show overview ⌘E"));
  return screen.getByRole("dialog", { name: "Overview" });
};
afterEach(() => {
  cleanup();
  capSlots.splice(0).forEach((el) => el.remove());
});

const CODEX_FILE = "/u/.codex/config.toml";
const CLAUDE_FILE = "/u/.claude.json";
const DESKTOP_FILE = "/u/Library/Application Support/Claude/claude_desktop_config.json";
const STASH = "stash:00000000-0000-4000-8000-000000000001";
const key = (file: string, name: string) => `${file}:${name}`;

const item = (over: Partial<ContextItem> & Pick<ContextItem, "key" | "name">): ContextItem =>
  ({
    tier: "global",
    config_path: "~/.codex/config.toml",
    state: "on",
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
    ...over,
  }) as ContextItem;

const CODEX: EngineContext = {
  engine_id: "codex",
  engine_key: "codex",
  engine_name: "Engine C",
  applies: null,
  switches_by_name: false,
  items: [
    item({ key: key(CODEX_FILE, "alpha"), name: "alpha", estimated_tokens: 9000, tool_count: 12 }),
    item({ key: key(CODEX_FILE, "beta"), name: "beta", estimated_tokens: 3400, tool_count: 5 }),
    item({ key: key(CODEX_FILE, "gamma"), name: "gamma", read_only: "per_project_comes_next" }),
    item({ key: key(CODEX_FILE, "delta"), name: "delta", state: "off" }),
  ],
  on_count: 3,
  off_count: 1,
  measured_on_count: 2,
  on_tokens_measured: 12400,
};

const CLAUDE: EngineContext = {
  engine_id: "claude-code",
  engine_key: "claude_code",
  engine_name: "Engine K",
  applies: null,
  switches_by_name: false,
  items: [
    item({ key: key(CLAUDE_FILE, "spades"), name: "spades", tier: "user", config_path: "~/.claude.json", estimated_tokens: 800, tool_count: 2 }),
    item({ key: STASH, name: "kappa", tier: "user", config_path: "", state: "off" }),
  ],
  on_count: 1,
  off_count: 1,
  measured_on_count: 1,
  on_tokens_measured: 800,
};

const ENGINES: EngineListEntry[] = [
  { engine_id: "codex", engine_name: "Engine C" },
  { engine_id: "claude-code", engine_name: "Engine K" },
  { engine_id: "claude-desktop", engine_name: "Engine D" },
];

const KEPT: KeptOff = {
  servers: [
    { key: STASH, name: "kappa", engine_id: "claude-code", engine_name: "Engine K", transport: "stdio", at_ms: 1795566217263, also_declared: false },
  ],
  count: 1,
  only_kept_count: 1,
};

const row = (name: string, registrations: string[]): McpServerRow => ({
  name,
  transport: "stdio",
  registration_count: registrations.length,
  distinct_spec_count: 1,
  file_count: registrations.length,
  agreement: "Consistent",
  aliased_with: [],
  plugin: null,
  registrations,
});

const SERVERS: McpServerRow[] = [
  row("alpha", [key(CODEX_FILE, "alpha")]),
  row("beta", [key(CODEX_FILE, "beta")]),
  row("gamma", [key(CODEX_FILE, "gamma")]),
  row("delta", [key(CODEX_FILE, "delta")]),
  row("spades", [key(CLAUDE_FILE, "spades")]),
  row("desk", [key(DESKTOP_FILE, "desk")]),
];

const tool = (file: string, name: string, agent: string) => ({
  id: key(file, name),
  name,
  command: "npx",
  transport: "stdio",
  config_path: file,
  scope: { Global: { agent } },
  owning_agent: agent,
});

const skill = (name: string) => ({
  id: name,
  name,
  description: "",
  version: "1",
  path: `/u/.agents/skills/${name}`,
  scope: { Global: { agent: "none" } },
});

const inventory = {
  agents: [], rules: [], subagents: [], project_scans: [],
  skills: [skill("atlas"), skill("bolt"), skill("cobalt"), skill("drift")],
  tools: [
    tool(CODEX_FILE, "alpha", "codex"),
    tool(CODEX_FILE, "beta", "codex"),
    tool(CODEX_FILE, "gamma", "codex"),
    tool(CODEX_FILE, "delta", "codex"),
    tool(CLAUDE_FILE, "spades", "claude-code"),
    tool(DESKTOP_FILE, "desk", "claude-desktop"),
  ],
} as any;

const codexReach = (reached: boolean, reason: string | null = null) => ({
  engine_id: 2,
  engine_key: "codex",
  engine_name: "Engine C",
  reached,
  reason,
});
const claudeReach = (reached: boolean, reason: string | null = null) => ({
  engine_id: 1,
  engine_key: "claude_code",
  engine_name: "Engine K",
  reached,
  reason,
});

/** atlas reaches Codex; bolt's root is not linked for it; cobalt is another
 *  engine's format; drift has no verdict for Codex at all. Every tool is
 *  Codex's format unless Codex owns it. */
const annotations = [
  { asset_path: skill("atlas").path, mechanism: "none", reach: [codexReach(true), claudeReach(false, "root_not_linked")], beyond: null },
  { asset_path: skill("bolt").path, mechanism: "none", reach: [codexReach(false, "root_not_linked"), claudeReach(true)], beyond: null },
  { asset_path: skill("cobalt").path, mechanism: "none", reach: [codexReach(false, "format"), claudeReach(true)], beyond: null },
  { asset_path: skill("drift").path, mechanism: "none", reach: [claudeReach(true)], beyond: null },
  ...inventory.tools.map((t: { id: string; owning_agent: string }) => ({
    asset_path: t.id,
    mechanism: "none",
    reach: [
      codexReach(t.owning_agent === "codex", t.owning_agent === "codex" ? null : "format"),
      claudeReach(t.owning_agent === "claude-code", t.owning_agent === "claude-code" ? null : "format"),
    ],
    beyond: null,
  })),
] as any;

const switcher: McpSwitch = {
  notice: null,
  busyKeys: new Set<string>(),
  switchServer: vi.fn(async () => null),
  undo: vi.fn(async () => null),
  dismiss: vi.fn(),
} as any;

type PaneProps = ComponentProps<typeof ProfilePane>;
const props = (over: Partial<PaneProps> = {}): PaneProps => ({
  inventory,
  annotations,
  assetCounts: {
    total: 10,
    byCategory: { skill: { total: 4, global: 4, project: 0 }, tool: { total: 6, global: 6, project: 0 } },
    engines: { codex: 4, claude_code: 6 },
  } as any,
  mcpServers: SERVERS,
  serverGrouping: "server",
  serverSort: "name",
  mcpCoverage: { checked_file_count: 3, checked_engine_count: 3, checked_files: [], problems: [] },
  loading: false,
  scannedAt: new Date(),
  onSelectAsset: vi.fn(),
  onLinkAsset: vi.fn(),
  engineContexts: [CODEX, CLAUDE],
  switcher,
  engines: ENGINES,
  selectedEngine: null,
  onSelectEngine: vi.fn(),
  onRescan: vi.fn(),
  ...over,
});

const listed = () =>
  Array.from(screen.getByTestId("asset-list-scroll").querySelectorAll("[data-selected]"))
    .filter((el) => !el.closest("[data-testid='not-loaded-group']"))
    .map((el) => el.querySelector(".truncate")?.textContent ?? "");
const group = () => screen.getByTestId("not-loaded-group");
const fold = () => within(group()).getByRole("button", { name: /^Not loaded by/ });
const notLoaded = () =>
  within(group())
    .queryAllByTestId("not-loaded-row")
    .map((r) => r.textContent);
const card = () => screen.getByRole("dialog", { name: "Overview" });
const chipGroup = () => within(card()).getByRole("group", { name: "Engines" });
const engineRow = (name: string) => chipGroup().querySelector(`[data-engine-name="${name}"]`) as HTMLElement;

describe("the overview card's engines replace the By engine band", () => {
  it("draw on every tab, All engines first, then ranked, and Global has no band", () => {
    for (const tab of [undefined, "Skills", "Tools", "Rules", "Subagents"] as const) {
      const { unmount } = render(<ProfilePane {...props({ selectedCategory: tab ?? null })} {...slots()} />);
      openOverview();
      // The card ranks by tokens every session: Engine C's 12,400 over
      // Engine K's 800. Its rows are the engines with a context.
      expect(within(chipGroup()).getAllByRole("button").map((b) => b.getAttribute("data-engine-name"))).toEqual([
        "All engines",
        "Engine C",
        "Engine K",
      ]);
      expect(screen.queryByTestId("hero-band")).toBeNull();
      unmount();
    }
  });

  it("mark the picked engine, each with its brand mark, and say which was chosen", () => {
    const onSelectEngine = vi.fn();
    render(<ProfilePane {...props({ selectedEngine: "codex", onSelectEngine })} {...slots()} />);
    openOverview();
    const all = engineRow("All engines");
    const c = engineRow("Engine C");
    expect(all.getAttribute("aria-current")).toBeNull();
    expect(c.getAttribute("aria-current")).toBe("true");
    // The mark comes from the sprite: a <use> into #brand-…; All engines has none.
    expect(c.querySelector("use")).not.toBeNull();
    expect(all.querySelector("use")).toBeNull();
    fireEvent.click(engineRow("Engine K"));
    expect(onSelectEngine).toHaveBeenLastCalledWith("claude-code");
    fireEvent.click(all);
    expect(onSelectEngine).toHaveBeenLastCalledWith(null);
  });

  it("claim nothing before the engine contexts land", () => {
    render(<ProfilePane {...props({ scannedAt: null, engineContexts: null })} {...slots()} />);
    openOverview();
    expect(within(card()).queryByRole("group", { name: "Engines" })).toBeNull();
  });
});

describe("with an engine picked, the list is what it reaches", () => {
  it("keeps a skill the backend says it reaches, and lists the misses with their reason", () => {
    render(<ProfilePane {...props({ selectedCategory: "Skills", selectedEngine: "codex" })} />);
    expect(listed()).toEqual(["atlas"]);
    // Folded until asked, and no figure: the backend counts none.
    expect(fold().getAttribute("aria-expanded")).toBe("false");
    expect(fold().textContent).toBe("Not loaded by Engine C");
    expect(notLoaded()).toEqual([]);
    fireEvent.click(fold());
    expect(fold().getAttribute("aria-expanded")).toBe("true");
    // drift has no verdict for this engine, so it is in neither list.
    expect(notLoaded()).toEqual(["boltSkillNot linked", "cobaltSkillAnother engine's format"]);
  });

  it("with All engines every row shows and there is no Not loaded group", () => {
    render(<ProfilePane {...props({ selectedCategory: "Skills" })} />);
    expect(listed()).toEqual(["atlas", "bolt", "cobalt", "drift"]);
    expect(screen.queryByTestId("not-loaded-group")).toBeNull();
  });

  it("a Not loaded row opens its asset in the inspector", () => {
    const onSelectAsset = vi.fn();
    render(<ProfilePane {...props({ selectedCategory: "Skills", selectedEngine: "codex", onSelectAsset })} />);
    fireEvent.click(fold());
    fireEvent.click(within(group()).getAllByTestId("not-loaded-row")[0]);
    expect(onSelectAsset).toHaveBeenCalledWith({ name: "bolt", category: "Skills", path: skill("bolt").path });
  });

  it("keeps the MCP servers the engine's context registers, as the band's filter did", () => {
    render(<ProfilePane {...props({ selectedCategory: "Tools", selectedEngine: "codex" })} />);
    expect(listed()).toEqual(["alpha", "beta", "delta", "gamma"]);
    fireEvent.click(fold());
    expect(notLoaded()).toEqual(["deskstdioAnother engine's format", "spadesstdioAnother engine's format"]);
    // The T2 tiles still switch the rows that stay.
    expect(screen.getByRole("button", { name: "Switch alpha off for Engine C" })).toBeTruthy();
  });

  it("reaches the same verdicts one row per registration", () => {
    render(<ProfilePane {...props({ selectedCategory: "Tools", selectedEngine: "claude-code", serverGrouping: "registration" })} />);
    expect(listed()).toEqual(["spades"]);
  });

  it("shows nothing for an engine whose context has not landed, rather than every server", () => {
    render(<ProfilePane {...props({ selectedCategory: "Tools", selectedEngine: "claude-desktop" })} />);
    expect(screen.queryByText("alpha")).toBeNull();
  });

  it("keeps the engine's switched-off servers in Switched off, and no other engine's", () => {
    const { unmount } = render(
      <ProfilePane {...props({ selectedCategory: "Tools", selectedEngine: "codex", keptOff: KEPT })} />
    );
    expect(screen.queryByText("Off for Engine K")).toBeNull();
    unmount();
    render(<ProfilePane {...props({ selectedCategory: "Tools", selectedEngine: "claude-code", keptOff: KEPT })} />);
    expect(screen.getByText("Off for Engine K")).toBeTruthy();
  });

  it("drops each section's store figure while filtered, and keeps it with All engines", () => {
    const { unmount } = render(<ProfilePane {...props()} />);
    // The heads draw label, hairline and figure apart (Task 1 of
    // docs/plans/2026-11-26-global-list.md); each heading is named in the
    // words its tick uses.
    expect(screen.getByRole("heading", { level: 3, name: "Skills · 4" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "MCP servers · 6" })).toBeTruthy();
    unmount();
    render(<ProfilePane {...props({ selectedEngine: "codex" })} />);
    expect(screen.queryByText(/^Skills · /)).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Skills" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "MCP servers" })).toBeTruthy();
  });

  it("puts the group once, at the end of the list, on All", () => {
    render(<ProfilePane {...props({ selectedEngine: "codex" })} />);
    fireEvent.click(fold());
    // The list's rows sit in its lane since Task 1 of
    // docs/plans/2026-11-26-global-list.md.
    const lane = screen.getByTestId("list-lane");
    expect(lane.lastElementChild).toBe(group());
    expect(notLoaded()).toEqual([
      "boltSkillNot linked",
      "cobaltSkillAnother engine's format",
      "deskstdioAnother engine's format",
      "spadesstdioAnother engine's format",
    ]);
  });

  it("an engine that reaches nothing on a tab says no row matches, never that the store is empty", () => {
    render(
      <ProfilePane
        {...props({
          selectedCategory: "Skills",
          selectedEngine: "codex",
          annotations: annotations.filter((a: { asset_path: string }) => !a.asset_path.includes("skills")),
        })}
      />
    );
    expect(screen.getByText("No skill matches that filter")).toBeTruthy();
    expect(screen.queryByText("No skills in the global store")).toBeNull();
  });
});

describe("the inspector's measure control", () => {
  // Moved here from the retired engine_band.test.tsx with the band.
  const server: McpServerView = {
    name: "spades",
    command: "node",
    transport: "stdio",
    registrations: [
      { key: "k1", host: "Engine K", tier: "user", configPath: "~/.claude.json", command: "node", launchDisplay: "node" },
    ],
    envKeys: [],
  };
  function Harness(p: Partial<ComponentProps<typeof McpServerDetail>>) {
    const [tab, setTab] = useState<"primary" | "details">("primary");
    return <McpServerDetail server={server} onOpenConfig={() => {}} tab={tab} onTabChange={setTab} {...p} />;
  }

  it("reads Measure before an answer, and Measure again after one", () => {
    const onVerify = vi.fn();
    const { unmount } = render(<Harness onVerify={onVerify} />);
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    expect(onVerify).toHaveBeenCalledWith("k1");
    expect(screen.queryByRole("button", { name: /verify/i })).toBeNull();
    unmount();

    render(
      <Harness
        onVerify={onVerify}
        verified={{ k1: { kind: "answered", capabilities: [], tools: [{ name: "play" }], verifiedAt: 1_700_000_000_000 } }}
      />
    );
    expect(screen.getByRole("button", { name: "Measure again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  });
});

/** Engine D, one server on and nobody has asked it. */
const DESK: EngineContext = {
  engine_id: "claude-desktop",
  engine_key: "claude_desktop",
  engine_name: "Engine D",
  applies: null,
  switches_by_name: false,
  items: [item({ key: key(DESKTOP_FILE, "desk"), name: "desk" })],
  on_count: 1,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
};

/** The card's engine section, headed by the picked engine's name. */
const engineSection = (name: string) => within(card()).getByRole("region", { name });
const figureOf = (name: string) => engineSection(name).querySelector(".text-lg-app")?.textContent ?? null;
const kinds = () => Array.from(within(card()).getByTestId("overview-kinds").querySelectorAll("button"));
const kind = (key: string) => within(card()).getByTestId("overview-kinds").querySelector(`[data-kind="${key}"]`) as HTMLElement;
const valueOf = (el: HTMLElement) => el.querySelector('[data-cell="value"]')?.textContent;
const rowOf = (name: string) =>
  Array.from(screen.getByTestId("asset-list-scroll").querySelectorAll("[data-selected]")).find(
    (el) => el.querySelector(".truncate")?.textContent === name
  ) as HTMLElement;

describe("the card with an engine picked shows its budget, on every tab", () => {
  it("leads with ≈ the MCP figure every session, and drops the link legend", () => {
    for (const tab of [null, "Skills", "Tools", "Rules", "Subagents"] as const) {
      const { unmount } = render(<ProfilePane {...props({ selectedCategory: tab, selectedEngine: "codex" })} {...slots()} />);
      openOverview();
      expect(figureOf("Engine C")).toBe("≈ 12,400");
      expect(within(engineSection("Engine C")).getByText("tokens every session")).toBeTruthy();
      expect(within(card()).queryByRole("button", { name: /linked$/ })).toBeNull();
      expect(within(card()).queryByText("The global store")).toBeNull();
      // Rescan stays in the card, and so do the engines above.
      expect(within(card()).getByRole("button", { name: /^Rescan/ })).toBeTruthy();
      expect(chipGroup()).toBeTruthy();
      unmount();
    }
  });

  it("splits it by kind: MCP servers with the budget's figure, its caption at the head, the other three Not measured", () => {
    render(<ProfilePane {...props({ selectedEngine: "codex" })} {...slots()} />);
    openOverview();
    const figures = engineBandFigures(CODEX);
    expect(figures.secondary).toBe("2 of 3 servers measured · 1 off");
    expect(within(engineSection("Engine C")).getByText(figures.secondary!)).toBeTruthy();
    expect(kinds().map((b) => b.getAttribute("data-kind"))).toEqual(["Tools", "Skills", "Rules", "Subagents"]);
    expect(valueOf(kind("Tools"))).toBe(figures.value);
    // Built from the tabs' labels and the approved "Not measured".
    expect(kinds().slice(1).map((b) => `${b.querySelector('[data-cell="name"]')?.textContent}: ${valueOf(b)}`)).toEqual([
      "Skills: Not measured",
      "Rules: Not measured",
      "Subagents: Not measured",
    ]);
  });

  it("says Not measured, never ≈ 0, for an engine with nothing measured", () => {
    render(<ProfilePane {...props({ selectedEngine: "claude-desktop", engineContexts: [CODEX, CLAUDE, DESK] })} {...slots()} />);
    openOverview();
    expect(figureOf("Engine D")).toBe("Not measured");
    expect(within(engineSection("Engine D")).getByText("0 of 1 servers measured")).toBeTruthy();
    expect(valueOf(kind("Tools"))).toBe("Not measured");
    expect(engineSection("Engine D").textContent).not.toContain("≈");
  });

  it("for an engine whose servers all run on the vendor's, says so and offers no Measure all", () => {
    // Q4 of docs/plans/2026-11-25-decisions-round-2.md: Claude.ai's case,
    // decided by a yes/no over the context's items.
    const vendor: EngineContext = {
      ...DESK,
      items: DESK.items.map((i) => ({ ...i, read_only: "runs_on_vendor_servers" as const })),
    };
    render(<ProfilePane {...props({ selectedEngine: "claude-desktop", engineContexts: [CODEX, CLAUDE, vendor] })} {...slots()} />);
    openOverview();
    expect(
      within(engineSection("Engine D")).getByText("Runs on Anthropic's servers. Hanger can't measure it from this machine.")
    ).toBeTruthy();
    expect(within(card()).queryByRole("button", { name: "Measure all" })).toBeNull();
    expect(within(card()).getByRole("button", { name: /^Rescan/ })).toBeTruthy();
  });

  it("a kind row opens its kind's tab and keeps the engine", () => {
    const onCategoryChange = vi.fn();
    const onSelectEngine = vi.fn();
    render(<ProfilePane {...props({ selectedEngine: "codex", onCategoryChange, onSelectEngine })} {...slots()} />);
    openOverview();
    expect(kind("Skills").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(kind("Skills"));
    expect(onCategoryChange).toHaveBeenLastCalledWith("Skills");
    expect(onSelectEngine).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /^Skills/ }).getAttribute("aria-selected")).toBe("true");
    expect(kind("Skills").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(kind("Tools"));
    expect(onCategoryChange).toHaveBeenLastCalledWith("Tools");
  });

  it("Measure all asks the picked engine alone, and hands its reply back", async () => {
    const measured = { ...CODEX, measured_on_count: 3, on_tokens_measured: 15000 };
    invoke.mockImplementation(async (cmd: string) => (cmd === "measure_engine_context" ? measured : null));
    const onEngineContext = vi.fn();
    render(<ProfilePane {...props({ selectedEngine: "codex", onEngineContext })} {...slots()} />);
    openOverview();
    const measure = within(card()).getByRole("button", { name: "Measure all" });
    expect(measure.getAttribute("title")).toBe(MEASURE_ALL_CAPTION);
    expect(document.getElementById(measure.getAttribute("aria-describedby") ?? "")?.textContent).toBe(MEASURE_ALL_CAPTION);
    fireEvent.click(within(card()).getByRole("button", { name: "Measure all" }));
    await waitFor(() => expect(onEngineContext).toHaveBeenCalledWith(measured));
    expect(invoke.mock.calls.filter((c) => c[0] === "measure_engine_context")).toEqual([
      ["measure_engine_context", { engineId: "codex" }],
    ]);
    await waitFor(() => expect(within(card()).getByRole("button", { name: "Measure all" })).toBeTruthy());
  });
});

describe("All engines: the card shows the store", () => {
  it("the legend, Rescan and no engine section, on every tab, and no MCP-mode subtitle", () => {
    for (const tab of [null, "Skills", "Tools"] as const) {
      const { unmount } = render(<ProfilePane {...props({ selectedCategory: tab })} {...slots()} />);
      openOverview();
      expect(within(card()).getByText("The global store")).toBeTruthy();
      expect(within(card()).getAllByRole("button", { name: /linked$/ }).length).toBeGreaterThan(0);
      expect(within(card()).getByRole("button", { name: /^Rescan/ })).toBeTruthy();
      expect(within(card()).queryByTestId("overview-kinds")).toBeNull();
      expect(within(card()).queryByRole("button", { name: "Measure all" })).toBeNull();
      expect(card().textContent).not.toContain("tool descriptions across");
      unmount();
    }
  });
});

describe("a skill row seen by one engine", () => {
  it("leads with that engine's tile and dims the rest, as an MCP row does", () => {
    // Q3 of docs/plans/2026-11-25-decisions-round-2.md: the selected
    // engine's tile leads every row, not only the MCP servers rows.
    render(<ProfilePane {...props({ selectedCategory: "Skills", selectedEngine: "codex" })} />);
    const tiles = Array.from(
      within(rowOf("atlas")).getByTestId("engine-reach-tiles").querySelectorAll("[data-testid^='reach-tile-']")
    );
    expect(tiles.map((t) => t.getAttribute("data-testid"))).toEqual(["reach-tile-codex", "reach-tile-claude_code"]);
    expect(tiles[0].hasAttribute("data-dimmed")).toBe(false);
    expect(tiles[1].getAttribute("data-dimmed")).toBe("true");
  });

  it("All engines leads with nobody and dims nothing", () => {
    render(<ProfilePane {...props({ selectedCategory: "Skills" })} />);
    const tiles = within(rowOf("atlas")).getByTestId("engine-reach-tiles");
    expect(tiles.querySelector("[data-dimmed]")).toBeNull();
  });
});

describe("an MCP row seen by one engine", () => {
  it("shows that engine's figure in the Tools column, or Not measured", () => {
    render(<ProfilePane {...props({ selectedCategory: "Tools", selectedEngine: "codex" })} />);
    expect(within(rowOf("alpha")).getByText("≈ 9,000 tokens")).toBeTruthy();
    expect(within(rowOf("delta")).getByText("Not measured")).toBeTruthy();
  });

  it("says why a read-only server has no switch, on its second line", () => {
    render(<ProfilePane {...props({ selectedCategory: "Tools", selectedEngine: "codex" })} />);
    const line = readOnlyLine("per_project_comes_next", { engine: "Engine C", server: "gamma", file: "~/.codex/config.toml" });
    expect(within(rowOf("gamma")).getByText(line)).toBeTruthy();
    expect(within(rowOf("alpha")).queryByText(line)).toBeNull();
  });

  it("leads with that engine's tile and dims the rest", () => {
    render(<ProfilePane {...props({ selectedCategory: "Tools", selectedEngine: "codex" })} />);
    const tiles = within(rowOf("alpha")).getByTestId("engine-reach-tiles");
    const [first, ...rest] = Array.from(tiles.children) as HTMLElement[];
    expect(first.querySelector("[data-testid='reach-tile-codex']") ?? first).toBeTruthy();
    expect(tiles.querySelector("[data-testid='reach-tile-codex']")!.closest("[data-dimmed]")).toBeNull();
    expect(rest.length).toBeGreaterThan(0);
    expect(tiles.querySelector("[data-testid='reach-tile-claude_code']")!.getAttribute("data-dimmed")).toBe("true");
  });

  it("with All engines keeps the tool count and no engine's reason", () => {
    render(<ProfilePane {...props({ selectedCategory: "Tools" })} />);
    expect(within(rowOf("alpha")).queryByText(/tokens/)).toBeNull();
    expect(within(rowOf("gamma")).queryByText(/Hanger can't switch/)).toBeNull();
    expect(rowOf("alpha").querySelector("[data-dimmed]")).toBeNull();
  });
});

describe("EngineReachTiles with a lead engine", () => {
  const reach: EngineReachInfo[] = [
    { engine_id: 2, engine_key: "codex", engine_name: "Engine C", reached: true },
    { engine_id: 1, engine_key: "claude_code", engine_name: "Engine K", reached: true },
  ];
  it("draws the lead engine's tile first, matched on its engine key, and dims the others", () => {
    const { container } = render(<EngineReachTiles reach={reach} leadEngine="claude_code" />);
    const ids = Array.from(container.querySelectorAll("[data-testid^='reach-tile-']")).map((t) => t.getAttribute("data-testid"));
    expect(ids).toEqual(["reach-tile-claude_code", "reach-tile-codex"]);
    expect(container.querySelector("[data-testid='reach-tile-codex']")!.getAttribute("data-dimmed")).toBe("true");
    expect(container.querySelector("[data-testid='reach-tile-claude_code']")!.hasAttribute("data-dimmed")).toBe(false);
  });
});
