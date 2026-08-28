// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "../App";

/**
 * The hero band's own wiring, in the only place that calls `invoke`.
 *
 * `ProfilePane` and `RepoPane` default `issues` to `[]` and both band-open
 * props to `false`, which is what keeps sixteen existing fixtures compiling —
 * and which also means a wrong preference key or a wrong `whereKeys` filter
 * renders no pill and no open band while every component test stays green. A
 * control that cannot fail is decoration; these are the assertions that can.
 * `repo_count_sync.test.tsx` is the precedent for pinning App wiring this way.
 */

vi.mock("@tauri-apps/plugin-log", () => ({
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => {}) }));

let mockPreferences: Record<string, string> = {};
let eventListeners: Record<string, Function> = {};

/* One broken asset in the global store and one in the repository, with
   DIFFERENT names: a shared name would make them a cross-repo `duplicate`
   carrying BOTH places in `whereKeys`, and a filter that ignored `whereKeys`
   entirely would then look correct in both panes. */
const inventory = {
  agents: [],
  skills: [
    { id: "g1", name: "global-skill", description: "", version: "", path: "/home/user/.claude/skills/global-skill",
      scope: { Global: { agent: "claude-code" } }, link_state: "broken" },
    { id: "p1", name: "repo-skill", description: "", version: "", path: "/Users/test/repo/.claude/skills/repo-skill",
      scope: { Project: { agent: "claude-code", root: "/Users/test/repo" } }, link_state: "broken" },
  ],
  tools: [],
  rules: [
    { id: "g2", name: "GLOBAL.md", path: "/home/user/.claude/GLOBAL.md", content: "",
      scope: { Global: { agent: "claude-code" } }, link_state: "broken" },
  ],
  subagents: [],
  project_scans: [{ path: "/Users/test/repo", layered: false, rule_chains: {}, parse_warnings: [] }],
};

const engineSummary = {
  rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 1, tools_known: 7 }],
  host_count: 1, tools_known_total: 7, total_server_count: 1,
  answered_server_count: 1, unasked_server_count: 0, unaskable_server_count: 0,
  conflicting_server_count: 0,
};

const serverRow = {
  name: "tauri", transport: "stdio", registration_count: 1, distinct_spec_count: 1,
  agreement: "Consistent", aliased_with: [], plugin: null,
  registrations: ["/home/user/.claude.json:tauri"],
};

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => { delete eventListeners[event]; });
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return ["/Users/test/repo"];
    if (cmd === "get_asset_counts") {
      return { total_assets: 3, skill: { total: 2, global: 1, project: 1 }, engines: { "Claude Code": 3 } };
    }
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_detected_engines") return [];
    if (cmd === "get_known_engines") return [];
    if (cmd === "get_mcp_servers") return [serverRow];
    if (cmd === "get_mcp_engine_summary") return engineSummary;
    if (cmd === "get_mcp_coverage") return { checked_file_count: 1, checked_engine_count: 1, checked_files: [], problems: [] };
    if (cmd === "get_mcp_processes") return [];
    if (cmd === "start_scan") {
      setTimeout(() => {
        eventListeners["scan://complete"]?.({ payload: { inventory } });
      }, 0);
      return "mock-scan-id";
    }
    return null;
  }),
}));

const basePrefs = {
  onboarding_complete: "true",
  consent_crash: "true",
  consent_usage: "true",
  sidebar_collapsed: "false",
  inspector_open: "false",
};

beforeEach(() => {
  cleanup();
  eventListeners = {};
});
afterEach(cleanup);

describe("the band's fold is a preference, under the keys App actually reads", () => {
  it("engines_band_open opens the project pane's band at startup, and the toggle writes it back", async () => {
    mockPreferences = { ...basePrefs, selected_sidebar_item: "/Users/test/repo", engines_band_open: "true" };
    render(<App />);
    // Open at startup: a wrong key on the read leaves the band folded, and
    // its rows are not in the DOM at all.
    await waitFor(() => expect(screen.getByTestId("hero-band-row-Claude Code")).toBeTruthy());
    expect(screen.getByTestId("hero-band-toggle").getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByTestId("hero-band-toggle"));
    // A wrong key on the WRITE leaves this one at its startup value.
    await waitFor(() => expect(mockPreferences["engines_band_open"]).toBe("false"));
  });

  it("hosts_band_open opens the Global MCP band at startup, and the toggle writes it back", async () => {
    mockPreferences = { ...basePrefs, selected_sidebar_item: "global:Tools", hosts_band_open: "true" };
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("hero-band-row-claude-code")).toBeTruthy());
    expect(screen.getByTestId("hero-band-toggle").getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByTestId("hero-band-toggle"));
    await waitFor(() => expect(mockPreferences["hosts_band_open"]).toBe("false"));
  });

  it("folded is the default when neither preference is set", async () => {
    mockPreferences = { ...basePrefs, selected_sidebar_item: "/Users/test/repo" };
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("hero-band-toggle")).toBeTruthy());
    expect(screen.getByTestId("hero-band-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("hero-band-row-Claude Code")).toBeNull();
  });
});

describe("each pane's pill gets only the issues that belong to it", () => {
  it("the Global pane sees the two global issues and not the repository's", async () => {
    mockPreferences = { ...basePrefs, selected_sidebar_item: "profile" };
    render(<App />);
    // Two global issues (global-skill, GLOBAL.md); the repo's is filtered out
    // by `whereKeys.includes("global")`. Passing `review.issues` unfiltered
    // would read 3.
    await waitFor(() => expect(screen.getByText("Needs review 2")).toBeTruthy());
    fireEvent.click(screen.getByText("Needs review 2"));
    const text = screen.getAllByTestId("finding-popover-line").map((l) => l.textContent).join(" ");
    expect(text).toContain("global-skill");
    expect(text).toContain("GLOBAL.md");
    expect(text).not.toContain("repo-skill");
  });

  it("a category tab narrows the Global pane's issues to that category", async () => {
    mockPreferences = { ...basePrefs, selected_sidebar_item: "global:Rules" };
    render(<App />);
    // Only GLOBAL.md is a Rules issue. Without the category narrowing this
    // reads "Needs review 2" while the tab shows one kind of asset.
    await waitFor(() => expect(screen.getByText("Needs review 1")).toBeTruthy());
    fireEvent.click(screen.getByText("Needs review 1"));
    expect(screen.getByTestId("finding-popover-line").textContent).toContain("GLOBAL.md");
  });

  it("the project pane sees its own issue and neither of the global ones", async () => {
    mockPreferences = { ...basePrefs, selected_sidebar_item: "/Users/test/repo" };
    render(<App />);
    // `whereKeys` for a project asset is its root path (`placeKey`,
    // reviewIssues.ts). Filtering on the wrong string — the sidebar item with
    // its category suffix, say — yields no pill at all.
    await waitFor(() => expect(screen.getByText("Needs review 1")).toBeTruthy());
    fireEvent.click(screen.getByText("Needs review 1"));
    const line = screen.getByTestId("finding-popover-line");
    expect(line.textContent).toContain("repo-skill");
    expect(line.textContent).not.toContain("global-skill");
  });
});
