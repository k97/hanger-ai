// @vitest-environment happy-dom
/** The engine tiles on Global's MCP servers rows are switches (T2 and D2 of
 *  docs/plans/2026-11-25-ia-engines-into-global.md; Karthik's answer to Q2: a
 *  click switches at once, and the notice offers Undo). A tile whose engine
 *  has an item for the row's registration sends the request every other
 *  switch sends; anything else keeps today's display. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import ProfilePane from "../components/ProfilePane";
import RepoPane from "../components/RepoPane";
import { busyKeyOf, type McpSwitch, type SwitchRequest } from "../hooks/useMcpSwitch";
import type { ContextItem, EngineContext } from "../types/engineContext";
import type { McpServerRow } from "../utils/serverRows";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null) }));

afterEach(cleanup);

const CODEX_KEY = "/u/.codex/config.toml:alpha";
const CLAUDE_KEY = "/u/.claude.json:alpha";
const GEMINI_USER_KEY = "/u/.gemini/settings.json:alpha";
const GEMINI_PROJECT_KEY = "/w/.gemini/settings.json:alpha";

const tool = (id: string, config_path: string, agent: string) => ({
  id,
  name: "alpha",
  command: "npx",
  transport: "stdio",
  config_path,
  scope: { Global: { agent } },
  owning_agent: agent,
});

const inventory = {
  skills: [], agents: [], rules: [], subagents: [], project_scans: [],
  tools: [
    tool(CODEX_KEY, "/u/.codex/config.toml", "codex"),
    tool(CLAUDE_KEY, "/u/.claude.json", "claude-code"),
    tool(GEMINI_USER_KEY, "/u/.gemini/settings.json", "gemini"),
  ],
} as any;

/** Reach as `annotations.rs` sends it for a registration: its own engine
 *  reaches it, the others cannot read the format. */
const reachFor = (owner: string) =>
  [
    { engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code" },
    { engine_id: 2, engine_key: "codex", engine_name: "Codex" },
    { engine_id: 3, engine_key: "gemini", engine_name: "Gemini CLI" },
  ].map((e) => ({ ...e, reached: e.engine_key === owner, reason: e.engine_key === owner ? null : "format" }));

const annotations = [
  { asset_path: CODEX_KEY, mechanism: "none", reach: reachFor("codex"), beyond: null },
  { asset_path: CLAUDE_KEY, mechanism: "none", reach: reachFor("claude_code"), beyond: null },
  { asset_path: GEMINI_USER_KEY, mechanism: "none", reach: reachFor("gemini"), beyond: null },
] as any;

const ROW: McpServerRow = {
  name: "alpha",
  transport: "stdio",
  registration_count: 4,
  distinct_spec_count: 1,
  file_count: 4,
  agreement: "Consistent",
  aliased_with: [],
  plugin: null,
  registrations: [CODEX_KEY, CLAUDE_KEY, GEMINI_PROJECT_KEY, GEMINI_USER_KEY],
};

const item = (over: Partial<ContextItem> & Pick<ContextItem, "key">): ContextItem =>
  ({
    name: "alpha",
    tier: "global",
    config_path: "~/.codex/config.toml",
    state: "on",
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
    ...over,
  }) as ContextItem;

const context = (engine_id: string, engine_name: string, items: ContextItem[], switches_by_name = false): EngineContext => ({
  engine_id,
  engine_name,
  applies: null,
  switches_by_name,
  items,
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

const CODEX = context("codex", "Engine C", [item({ key: CODEX_KEY })]);
const CLAUDE = context("claude-code", "Engine K", [
  item({ key: CLAUDE_KEY, tier: "user", config_path: "~/.claude.json", read_only: "managed_by_policy" }),
]);
const GEMINI = context(
  "gemini",
  "Engine G",
  [
    item({ key: GEMINI_PROJECT_KEY, tier: "project", config_path: "/w/.gemini/settings.json", read_only: "switches_by_name_everywhere" }),
    item({ key: GEMINI_USER_KEY, config_path: "~/.gemini/settings.json", state: "off" }),
  ],
  true
);
const CONTEXTS = [CODEX, CLAUDE, GEMINI];

const switcherWith = (over: Partial<McpSwitch> = {}): McpSwitch & { switchServer: ReturnType<typeof vi.fn> } =>
  ({
    notice: null,
    busyKeys: new Set<string>(),
    switchServer: vi.fn(async () => null),
    undo: vi.fn(async () => null),
    dismiss: vi.fn(),
    ...over,
  }) as any;

const base = { loading: false, onLinkAsset: vi.fn(), selectedCategory: "Tools" as const };

const lastRequest = (s: { switchServer: ReturnType<typeof vi.fn> }): SwitchRequest =>
  s.switchServer.mock.calls[s.switchServer.mock.calls.length - 1][0];

describe("Global › MCP servers: the engine tiles switch the server", () => {
  it("one per server: a tile sends its engine's key for the row's registration", () => {
    const switcher = switcherWith();
    render(
      <ProfilePane
        {...base}
        onSelectAsset={vi.fn()}
        inventory={inventory}
        annotations={annotations}
        mcpServers={[ROW]}
        engineContexts={CONTEXTS}
        switcher={switcher}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch alpha off for Engine C" }));
    expect(lastRequest(switcher)).toEqual({
      engineId: "codex",
      engineName: "Engine C",
      key: CODEX_KEY,
      serverName: "alpha",
      file: "~/.codex/config.toml",
      enabled: false,
    });
  });

  it("an engine that switches by name: the grouped row's tile sends the item it can switch", () => {
    const switcher = switcherWith();
    render(
      <ProfilePane
        {...base}
        onSelectAsset={vi.fn()}
        inventory={inventory}
        annotations={annotations}
        mcpServers={[ROW]}
        engineContexts={CONTEXTS}
        switcher={switcher}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch alpha on for Engine G" }));
    expect(lastRequest(switcher)).toMatchObject({ engineId: "gemini", key: GEMINI_USER_KEY, enabled: true });
  });

  it("one per registration: each row's tile is that registration's, and the other engines' stay display", () => {
    const switcher = switcherWith();
    render(
      <ProfilePane
        {...base}
        onSelectAsset={vi.fn()}
        inventory={inventory}
        annotations={annotations}
        mcpServers={[ROW]}
        serverGrouping="registration"
        engineContexts={CONTEXTS}
        switcher={switcher}
      />
    );
    // Codex's row: its own tile switches, Gemini's does not.
    const buttons = screen.getAllByRole("button", { name: /^Switch alpha (on|off) for / });
    expect(buttons.map((b) => b.getAttribute("aria-label")).sort()).toEqual([
      "Switch alpha off for Engine C",
      "Switch alpha on for Engine G",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Switch alpha on for Engine G" }));
    expect(lastRequest(switcher)).toMatchObject({ engineId: "gemini", key: GEMINI_USER_KEY, enabled: true });
  });

  it("a read-only engine's tile is inert and says why", () => {
    const switcher = switcherWith();
    render(
      <ProfilePane
        {...base}
        onSelectAsset={vi.fn()}
        inventory={inventory}
        annotations={annotations}
        mcpServers={[ROW]}
        engineContexts={CONTEXTS}
        switcher={switcher}
      />
    );
    const claude = screen.getByTestId("reach-tile-claude_code");
    expect(claude.getAttribute("data-read-only")).toBe("true");
    expect(claude.getAttribute("aria-label")).toBe(
      "Engine K — On. Set by a managed configuration. Hanger doesn't change managed files."
    );
    fireEvent.click(claude);
    expect(switcher.switchServer).not.toHaveBeenCalled();
  });

  it("a tile click does not select the row", () => {
    const onSelectAsset = vi.fn();
    render(
      <ProfilePane
        {...base}
        onSelectAsset={onSelectAsset}
        inventory={inventory}
        annotations={annotations}
        mcpServers={[ROW]}
        engineContexts={CONTEXTS}
        switcher={switcherWith()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch alpha off for Engine C" }));
    expect(onSelectAsset).not.toHaveBeenCalled();
    // The row itself still selects.
    fireEvent.click(screen.getByText("alpha"));
    expect(onSelectAsset).toHaveBeenCalledTimes(1);
  });

  it("a tile whose switch is in flight is disabled", () => {
    render(
      <ProfilePane
        {...base}
        onSelectAsset={vi.fn()}
        inventory={inventory}
        annotations={annotations}
        mcpServers={[ROW]}
        engineContexts={CONTEXTS}
        switcher={switcherWith({ busyKeys: new Set([busyKeyOf("codex", CODEX_KEY)]) })}
      />
    );
    const btn = screen.getByRole("button", { name: "Switch alpha off for Engine C" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("before the contexts load, every tile is display only", () => {
    render(
      <ProfilePane
        {...base}
        onSelectAsset={vi.fn()}
        inventory={inventory}
        annotations={annotations}
        mcpServers={[ROW]}
        engineContexts={null}
        switcher={switcherWith()}
      />
    );
    const tiles = within(screen.getByTestId("engine-reach-tiles"));
    expect(tiles.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTestId("reach-tile-codex").tagName).toBe("I");
  });

  it("hands the reply's context back, so the tile shows the new state without a rescan", async () => {
    const off = context("codex", "Engine C", [item({ key: CODEX_KEY, state: "off" })]);
    const switcher = switcherWith({ switchServer: vi.fn(async () => off) as any });
    const onEngineContext = vi.fn();
    const props = {
      ...base,
      onSelectAsset: vi.fn(),
      inventory,
      annotations,
      mcpServers: [ROW],
      switcher,
      onEngineContext,
    };
    const { rerender } = render(<ProfilePane {...props} engineContexts={CONTEXTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch alpha off for Engine C" }));
    await waitFor(() => expect(onEngineContext).toHaveBeenCalledWith(off));
    rerender(<ProfilePane {...props} engineContexts={[off, CLAUDE, GEMINI]} />);
    const btn = screen.getByRole("button", { name: "Switch alpha on for Engine C" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("a repository's MCP rows", () => {
  // A guard rather than a red-first test: RepoPane hands its card rows no
  // annotation today (known-debt: a repo's MCP columns are blank), so no tile
  // renders there at all. This fails the day a repo row starts drawing
  // switches without anyone deciding it should.
  it("draw no switch", () => {
    const repoInventory = {
      skills: [], agents: [], rules: [], subagents: [], project_scans: [],
      tools: [
        {
          id: "/Users/test/Work/.mcp.json:alpha",
          name: "alpha",
          command: "npx",
          transport: "stdio",
          config_path: "/Users/test/Work/.mcp.json",
          scope: { Project: { agent: "claude-code", root: "/Users/test/Work" } },
          owning_agent: "claude-code",
        },
      ],
    } as any;
    render(
      <RepoPane
        repoPath="/Users/test/Work"
        inventory={repoInventory}
        loading={false}
        selectedCategory="Tools"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /^Switch alpha/ })).toHaveLength(0);
    expect(document.querySelector('button[data-testid^="reach-tile-"]')).toBeNull();
  });
});
