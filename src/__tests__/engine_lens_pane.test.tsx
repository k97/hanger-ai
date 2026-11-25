// @vitest-environment happy-dom
/** Global seen by one engine, the pane's share (Phase 1 of
 *  docs/plans/2026-11-25-ia-global-by-engine.md). The engine chips sit in
 *  the strip on every tab and replace the "By engine" band; with an engine
 *  picked the list keeps what that engine reaches — a skill by its backend
 *  `reached` verdict, an MCP server by its registrations in the engine's
 *  context, as the band's filter did — and "Not loaded by {engine}" lists the
 *  rest the backend says it does not reach, with the reason. Counts stay the
 *  backend's: a section header drops its store figure while filtered rather
 *  than show one the rows below contradict, and the group has none. */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { useState, type ComponentProps } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import ProfilePane from "../components/ProfilePane";
import McpServerDetail, { type McpServerView } from "../components/McpServerDetail";
import type { McpSwitch } from "../hooks/useMcpSwitch";
import type { ContextItem, EngineContext, KeptOff } from "../types/engineContext";
import type { McpEngineSummaryData } from "../types/mcpEngineSummary";
import type { McpServerRow } from "../utils/serverRows";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), openPath: vi.fn(), revealItemInDir: vi.fn() }));

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async () => null);
});
afterEach(cleanup);

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

const SUMMARY: McpEngineSummaryData = {
  rows: [
    { engine_id: "codex", engine_name: "Engine C", server_count: 4, tools_known: 17 },
    { engine_id: "claude-code", engine_name: "Engine K", server_count: 1, tools_known: 2 },
    { engine_id: "claude-desktop", engine_name: "Engine D", server_count: 1, tools_known: null },
  ],
  host_count: 3,
  tools_known_total: 19,
  total_server_count: 6,
  answered_server_count: 3,
  unasked_server_count: 3,
  unaskable_server_count: 0,
  conflicting_server_count: 0,
};
const ENGINES = SUMMARY.rows.map((r) => ({ engine_id: r.engine_id, engine_name: r.engine_name }));

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
  mcpEngineSummary: SUMMARY,
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
const strip = () => screen.getByLabelText("Inventory summary");
const chipGroup = () => within(strip()).getByRole("group", { name: "Engines" });

describe("the engine chips replace the By engine band", () => {
  it("draw in the strip on every tab, All engines first, and Global has no band", () => {
    for (const tab of [undefined, "Skills", "Tools", "Rules", "Subagents"] as const) {
      const { unmount } = render(<ProfilePane {...props({ selectedCategory: tab ?? null })} />);
      expect(within(chipGroup()).getAllByRole("button").map((b) => b.textContent)).toEqual([
        "All engines",
        "Engine C",
        "Engine K",
        "Engine D",
      ]);
      expect(screen.queryByTestId("hero-band")).toBeNull();
      unmount();
    }
  });

  it("press the picked engine, each with its brand mark, and say which was chosen", () => {
    const onSelectEngine = vi.fn();
    render(<ProfilePane {...props({ selectedEngine: "codex", onSelectEngine })} />);
    const [all, c] = within(chipGroup()).getAllByRole("button");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(c.getAttribute("aria-pressed")).toBe("true");
    // The mark comes from the sprite: a <use> into #brand-…; All engines has none.
    expect(c.querySelector("use")).not.toBeNull();
    expect(all.querySelector("use")).toBeNull();
    fireEvent.click(within(chipGroup()).getByRole("button", { name: "Engine K" }));
    expect(onSelectEngine).toHaveBeenLastCalledWith("claude-code");
    fireEvent.click(all);
    expect(onSelectEngine).toHaveBeenLastCalledWith(null);
  });

  it("wrap rather than grow into a grid, at any width", () => {
    render(<ProfilePane {...props()} />);
    const cls = chipGroup().className;
    expect(cls).toContain("flex-wrap");
    expect(cls).not.toMatch(/\bgrid\b/);
  });

  it("claim nothing before the first scan", () => {
    render(<ProfilePane {...props({ scannedAt: null })} />);
    expect(within(strip()).queryByRole("group", { name: "Engines" })).toBeNull();
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
    expect(screen.getByText("Skills · 4")).toBeTruthy();
    expect(screen.getByText("MCP servers · 6")).toBeTruthy();
    unmount();
    render(<ProfilePane {...props({ selectedEngine: "codex" })} />);
    expect(screen.queryByText(/^Skills · /)).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Skills" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "MCP servers" })).toBeTruthy();
  });

  it("puts the group once, at the end of the list, on All", () => {
    render(<ProfilePane {...props({ selectedEngine: "codex" })} />);
    fireEvent.click(fold());
    const scroll = screen.getByTestId("asset-list-scroll");
    expect(scroll.lastElementChild).toBe(group());
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
