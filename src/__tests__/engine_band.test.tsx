// @vitest-environment happy-dom
/** Global › MCP servers: the hero band is "By engine" (T3, D3 and D4 of
 *  docs/plans/2026-11-25-ia-engines-into-global.md, and Karthik's answer to
 *  Q1). Its figures are each engine's `get_engine_context`, counted the way
 *  the Engines tab's budget card counts them; a row filters the list to the
 *  servers that engine registers; the band carries Measure all. */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { useState, type ComponentProps } from "react";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import ProfilePane from "../components/ProfilePane";
import EnginesPane from "../components/EnginesPane";
import McpServerDetail, { type McpServerView } from "../components/McpServerDetail";
import type { McpSwitch } from "../hooks/useMcpSwitch";
import type { ContextItem, EngineContext } from "../types/engineContext";
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

/** Three servers on, two of them measured, one off: the shape
 *  `mcp::switch::context::build` produces for an engine part-way measured. */
const CODEX: EngineContext = {
  engine_id: "codex",
  engine_name: "Engine C",
  applies: null,
  switches_by_name: false,
  items: [
    item({ key: key(CODEX_FILE, "alpha"), name: "alpha", estimated_tokens: 9000, tool_count: 12 }),
    item({ key: key(CODEX_FILE, "beta"), name: "beta", estimated_tokens: 3400, tool_count: 5 }),
    item({ key: key(CODEX_FILE, "gamma"), name: "gamma" }),
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
  ],
  on_count: 1,
  off_count: 0,
  measured_on_count: 1,
  on_tokens_measured: 800,
};

/** Three engines declare servers; only two contexts have landed. */
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

const inventory = {
  skills: [], agents: [], rules: [], subagents: [], project_scans: [],
  tools: [
    tool(CODEX_FILE, "alpha", "codex"),
    tool(CODEX_FILE, "beta", "codex"),
    tool(CODEX_FILE, "gamma", "codex"),
    tool(CODEX_FILE, "delta", "codex"),
    tool(CLAUDE_FILE, "spades", "claude-code"),
    tool(DESKTOP_FILE, "desk", "claude-desktop"),
  ],
} as any;

/** Codex's own registrations reach Codex, so their rows draw its tile. */
const annotations = inventory.tools.map((t: { id: string; owning_agent: string }) => ({
  asset_path: t.id,
  mechanism: "none",
  reach: [{ engine_id: 2, engine_key: "codex", engine_name: "Engine C", reached: t.owning_agent === "codex", reason: t.owning_agent === "codex" ? null : "format" }],
  beyond: null,
})) as any;

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
  assetCounts: { total: 6, byCategory: { tool: { total: 6, global: 6, project: 0 } }, engines: {} } as any,
  selectedCategory: "Tools",
  mcpServers: SERVERS,
  mcpEngineSummary: SUMMARY,
  serverGrouping: "server",
  serverSort: "name",
  mcpCoverage: { checked_file_count: 3, checked_engine_count: 3, checked_files: [], problems: [] },
  loading: false,
  onSelectAsset: vi.fn(),
  onLinkAsset: vi.fn(),
  hostsBandOpen: true,
  engineContexts: [CODEX, CLAUDE],
  switcher,
  ...over,
});

const bandRow = (engineId: string) => screen.getByTestId(`hero-band-row-${engineId}`);
const listed = () =>
  Array.from(document.querySelectorAll("[data-selected]")).map((el) => el.querySelector(".truncate")?.textContent ?? "");

describe("the band's label and the strip's wording", () => {
  it("reads By engine, and the strip counts engines", () => {
    render(<ProfilePane {...props()} />);
    expect(screen.getByTestId("hero-band-toggle").textContent).toContain("By engine");
    expect(screen.getByText("MCP servers · 19 tool descriptions across 3 engines")).toBeTruthy();
  });

  it("says one engine, and engines before anything is probed", () => {
    const one = { ...SUMMARY, rows: [SUMMARY.rows[0]], host_count: 1, tools_known_total: null };
    const { unmount } = render(<ProfilePane {...props({ mcpEngineSummary: one })} />);
    expect(screen.getByText("MCP servers across 1 engine")).toBeTruthy();
    unmount();
    render(<ProfilePane {...props({ mcpEngineSummary: { ...SUMMARY, tools_known_total: null } })} />);
    expect(screen.getByText("MCP servers across 3 engines")).toBeTruthy();
  });
});

describe("an engine's figures are the Engines tab's", () => {
  it("shows the same tokens and the same measured caption as the budget card, from one context", async () => {
    invoke.mockImplementation(async (cmd: string) => (cmd === "get_engine_context" ? CODEX : null));
    render(
      <EnginesPane
        engines={[{ engine_id: "codex", engine_name: "Engine C" }]}
        engineId="codex"
        onSelectEngine={vi.fn()}
        openItem={() => null}
        scannedAt={new Date()}
        switcher={switcher}
        refreshNonce={0}
      />
    );
    const budget = await screen.findByTestId("engine-budget");
    const [headline, caption] = Array.from(budget.querySelectorAll("span.flex-col > span")).map((s) => s.textContent);
    expect(headline).toBe("≈ 12,400 tokens of tool descriptions");
    cleanup();

    render(<ProfilePane {...props({ engineContexts: [CODEX] })} />);
    const codex = bandRow("codex");
    expect(codex.textContent).toContain("≈ 12,400");
    expect(codex.textContent).toContain("tokens");
    expect(codex.textContent).toContain(caption!);
    expect(caption).toBe("2 of 3 servers measured · 1 off");
    // D4: an engine's figure is tokens; tool counts stay on server rows.
    expect(codex.textContent).not.toContain("17");
    expect(codex.textContent).not.toMatch(/tools?\b/);
  });

  it("leaves the off figure out when nothing is off", () => {
    render(<ProfilePane {...props()} />);
    const claude = bandRow("claude-code");
    expect(claude.textContent).toContain("≈ 800");
    expect(claude.textContent).toContain("1 of 1 servers measured");
    expect(claude.textContent).not.toContain("off");
  });

  it("says Not measured, never a zero, for an engine whose context has not landed", () => {
    render(<ProfilePane {...props()} />);
    const desk = bandRow("claude-desktop");
    expect(desk.textContent).toContain("Not measured");
    expect(desk.textContent).not.toMatch(/\b0\b/);
    expect((desk as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("an engine with nothing measured", () => {
  /** One server on, nobody has asked it: the shape `context::build` emits
   *  for Claude Desktop before Measure all, and for every Claude.ai
   *  connector, which no measure can ask. */
  const DESK: EngineContext = {
    engine_id: "claude-desktop",
    engine_name: "Engine D",
    applies: null,
    switches_by_name: false,
    items: [item({ key: key(DESKTOP_FILE, "desk"), name: "desk" })],
    on_count: 1,
    off_count: 0,
    measured_on_count: 0,
    on_tokens_measured: 0,
  };
  /** One server on, asked, and it described no tools: measured, at zero. */
  const EMPTY_TOOLS: EngineContext = {
    ...DESK,
    items: [item({ key: key(DESKTOP_FILE, "desk"), name: "desk", estimated_tokens: 0, tool_count: 0 })],
    measured_on_count: 1,
  };
  /** Its one server switched off: nothing on, so nothing loaded. */
  const ALL_OFF: EngineContext = {
    ...DESK,
    items: [item({ key: key(DESKTOP_FILE, "desk"), name: "desk", state: "off" })],
    on_count: 0,
    off_count: 1,
  };

  async function budgetLines(ctx: EngineContext) {
    invoke.mockImplementation(async (cmd: string) => (cmd === "get_engine_context" ? ctx : null));
    render(
      <EnginesPane
        engines={[{ engine_id: ctx.engine_id, engine_name: ctx.engine_name }]}
        engineId={ctx.engine_id}
        onSelectEngine={vi.fn()}
        openItem={() => null}
        scannedAt={new Date()}
        switcher={switcher}
        refreshNonce={0}
      />
    );
    const budget = await screen.findByTestId("engine-budget");
    const lines = Array.from(budget.querySelectorAll("span.flex-col > span")).map((s) => s.textContent);
    const rows = screen.getAllByTestId("engine-item");
    cleanup();
    return { lines, rows };
  }

  it("says Not measured, not ≈ 0, in the band and on the budget card, and keeps the caption", async () => {
    const { lines } = await budgetLines(DESK);
    expect(lines).toEqual(["Not measured", "0 of 1 servers measured"]);

    render(<ProfilePane {...props({ engineContexts: [CODEX, CLAUDE, DESK] })} />);
    const desk = bandRow("claude-desktop");
    expect(desk.textContent).toContain("Not measured");
    expect(desk.textContent).toContain("0 of 1 servers measured");
    expect(desk.textContent).not.toContain("≈");
    expect(desk.textContent).not.toContain("tokens");
  });

  it("still says ≈ 0 for an engine whose measured servers describe nothing", async () => {
    const { lines } = await budgetLines(EMPTY_TOOLS);
    expect(lines).toEqual(["≈ 0 tokens of tool descriptions", "1 of 1 servers measured"]);

    render(<ProfilePane {...props({ engineContexts: [CODEX, CLAUDE, EMPTY_TOOLS] })} />);
    const desk = bandRow("claude-desktop");
    expect(desk.textContent).toContain("≈ 0");
    expect(desk.textContent).not.toContain("Not measured");
  });

  it("still says ≈ 0 for an engine with every server off: nothing on is nothing loaded", async () => {
    const { lines } = await budgetLines(ALL_OFF);
    expect(lines).toEqual(["≈ 0 tokens of tool descriptions", "0 of 0 servers measured · 1 off"]);

    render(<ProfilePane {...props({ engineContexts: [CODEX, CLAUDE, ALL_OFF] })} />);
    expect(bandRow("claude-desktop").textContent).toContain("≈ 0");
  });

  it("labels a server nobody asked Not measured, and one that described nothing ≈ 0", async () => {
    const unasked = (await budgetLines(DESK)).rows;
    expect(within(unasked[0]).getByText("Not measured")).toBeTruthy();
    expect(within(unasked[0]).queryByText(/≈/)).toBeNull();

    const empty = (await budgetLines(EMPTY_TOOLS)).rows;
    expect(within(empty[0]).getByText("≈ 0 tokens")).toBeTruthy();
  });
});

describe("a row filters the list", () => {
  it("narrows to the engine's servers, keeps the switch tiles, and a second press clears it", () => {
    render(<ProfilePane {...props()} />);
    expect(listed()).toEqual(["alpha", "beta", "delta", "desk", "gamma", "spades"]);

    const codex = bandRow("codex");
    expect(codex.tagName).toBe("BUTTON");
    expect(codex.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(codex);
    expect(codex.getAttribute("aria-pressed")).toBe("true");
    expect(listed()).toEqual(["alpha", "beta", "delta", "gamma"]);
    // The T2 tiles still switch the filtered rows.
    expect(screen.getByRole("button", { name: "Switch alpha off for Engine C" })).toBeTruthy();

    fireEvent.click(codex);
    expect(codex.getAttribute("aria-pressed")).toBe("false");
    expect(listed()).toEqual(["alpha", "beta", "delta", "desk", "gamma", "spades"]);
  });

  it("moves to another engine in one press, and shows the active filter with the band folded", () => {
    const { rerender } = render(<ProfilePane {...props()} />);
    fireEvent.click(bandRow("codex"));
    fireEvent.click(bandRow("claude-code"));
    expect(bandRow("codex").getAttribute("aria-pressed")).toBe("false");
    expect(listed()).toEqual(["spades"]);

    // Folded, the rows are gone; the filter is still on and still says so.
    rerender(<ProfilePane {...props({ hostsBandOpen: false })} />);
    const chip = within(screen.getByTestId("hero-band")).getByRole("button", { name: "Engine K" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(listed()).toEqual(["spades"]);
    fireEvent.click(chip);
    expect(listed()).toEqual(["alpha", "beta", "delta", "desk", "gamma", "spades"]);
    expect(within(screen.getByTestId("hero-band")).queryByRole("button", { name: "Engine K" })).toBeNull();
  });
});

describe("one per registration", () => {
  it("keeps the band, and its rows still filter", () => {
    render(<ProfilePane {...props({ serverGrouping: "registration" })} />);
    expect(screen.getByTestId("hero-band-toggle").textContent).toContain("By engine");
    fireEvent.click(bandRow("claude-code"));
    expect(listed()).toEqual(["spades"]);
  });
});

describe("Measure all, in the band", () => {
  it("measures every engine the band lists, one at a time, and hands each reply back", async () => {
    const measured = { ...CODEX, measured_on_count: 3, on_tokens_measured: 15000 };
    let finishCodex: (ctx: EngineContext) => void = () => {};
    invoke.mockImplementation((cmd: string, args?: { engineId: string }) => {
      if (cmd !== "measure_engine_context") return Promise.resolve(null);
      if (args?.engineId === "codex") return new Promise((resolve) => (finishCodex = resolve));
      return Promise.resolve(args?.engineId === "claude-code" ? CLAUDE : { ...CODEX, engine_id: args!.engineId });
    });
    const onEngineContext = vi.fn();
    render(<ProfilePane {...props({ hostsBandOpen: false, onEngineContext })} />);

    const button = within(screen.getByTestId("hero-band")).getByRole("button", { name: "Measure all" });
    expect(button.getAttribute("title")).toBe(
      "Starts each server that's on and has no recent answer, and reads its tool list."
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(within(screen.getByTestId("hero-band")).getByRole("button", { name: "Measuring…" })).toBeTruthy()
    );
    const measureCalls = () => invoke.mock.calls.filter((c) => c[0] === "measure_engine_context");
    // One at a time: the next engine waits for the first, so a launch two
    // engines share is asked once and the second reads the cache.
    expect(measureCalls().map((c) => c[1])).toEqual([{ engineId: "codex" }]);

    finishCodex(measured);
    await waitFor(() => expect(measureCalls()).toHaveLength(3));
    expect(measureCalls().map((c) => c[1])).toEqual([
      { engineId: "codex" },
      { engineId: "claude-code" },
      { engineId: "claude-desktop" },
    ]);
    await waitFor(() =>
      expect(within(screen.getByTestId("hero-band")).getByRole("button", { name: "Measure all" })).toBeTruthy()
    );
    expect(onEngineContext).toHaveBeenCalledWith(measured);
    expect(onEngineContext).toHaveBeenCalledWith(CLAUDE);
  });
});

describe("the inspector's measure control", () => {
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
