// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import AssetDetail from "../components/AssetDetail";
import type { Inventory } from "../App";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

const SOURCE = "/home/me/.agents/skills/agent-browser/SKILL.md";

const DOC = [
  "---",
  "name: agent-browser",
  "description: Drives a Chromium instance over CDP.",
  "license: MIT",
  "allowed-tools: [Read, Bash]",
  "---",
  "",
  "# agent-browser",
  "",
  "Drives a Chromium instance over CDP so an agent can read rendered pages.",
  "",
  "## When to use",
  "",
  "- A page needs JavaScript before its content exists.",
  "- You need the rendered DOM, not the HTML source.",
  "",
  "## Requires",
  "",
  "`bun` >= 1.1 and a local Chrome.",
].join("\n");

let bodyResult: { ok: true; text: string } | { ok: false; error: string } = { ok: true, text: DOC };
// The backend answers with the file it read, which for a skill is the
// document inside the folder the panel handed it.
let bodyPath = SOURCE;
// The measurements `read_asset_body` took while reading the file. A test
// that cares about the Context row's arithmetic overrides this; every other
// test gets the values the suite has always returned.
let bodyFigures = { bytes: 431, lines: 21, estimated_tokens: 107 };
// The backend's mtime read, `Option<i64>` since 62cf6f8. Null when the
// platform reports no mtime; a test that cares about the absent-mtime case
// overrides this, every other test gets a real timestamp.
let bodyModifiedMs: number | null = Date.UTC(2026, 6, 20, 12);
let dirResult: Array<{ name: string; kind: string; bytes: number | null; file_count: number | null }> = [
  { name: "SKILL.md", kind: "file", bytes: 431, file_count: null },
  { name: "references/", kind: "dir", bytes: null, file_count: 3 },
  { name: "scripts/", kind: "dir", bytes: null, file_count: 1 },
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "read_asset_body") {
      if (bodyResult.ok)
        return {
          path: bodyPath,
          text: bodyResult.text,
          ...bodyFigures,
          modified_ms: bodyModifiedMs,
        };
      throw bodyResult.error;
    }
    if (cmd === "list_asset_dir") return dirResult;
    return null;
  }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(async () => {}),
  openUrl: vi.fn(async () => {}),
  revealItemInDir: vi.fn(async () => {}),
}));

const asset = {
  category: "Skills",
  name: "agent-browser",
  path: SOURCE,
  scopeBadge: "Global",
  version: "1.2.0",
};

const openDetails = () => fireEvent.click(screen.getByRole("tab", { name: "Details" }));

const inventory: Inventory = {
  agents: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
  skills: [
    { id: "1", name: "agent-browser", description: "", version: "1", path: SOURCE, scope: { Global: { agent: "claude" } } },
    { id: "2", name: "agent-browser", description: "", version: "1", path: "/mei-recipes/.claude/skills/agent-browser", scope: { Project: { agent: "claude", root: "/mei-recipes" } }, is_symlink: true, source_path: SOURCE },
    { id: "3", name: "agent-browser", description: "", version: "1", path: "/metrics-board/.claude/skills/agent-browser", scope: { Project: { agent: "claude", root: "/metrics-board" } }, is_symlink: true, source_path: SOURCE },
  ] as Inventory["skills"],
};

describe("Asset detail — the inspector's document screen", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    bodyResult = { ok: true, text: DOC };
    bodyPath = SOURCE;
    bodyFigures = { bytes: 431, lines: 21, estimated_tokens: 107 };
    bodyModifiedMs = Date.UTC(2026, 6, 20, 12);
    dirResult = [
      { name: "SKILL.md", kind: "file", bytes: 431, file_count: null },
      { name: "references/", kind: "dir", bytes: null, file_count: 3 },
      { name: "scripts/", kind: "dir", bytes: null, file_count: 1 },
    ];
  });

  it("states the file's relationships in one line", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    expect(await screen.findByText("The source for 2 copies")).toBeTruthy();
  });

  it("reads the file through the backend, by path", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("read_asset_body", { path: SOURCE });
    });
  });

  it("renders the document, not the raw markup", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);

    expect(await screen.findByText("When to use")).toBeTruthy();
    expect(screen.getByText("A page needs JavaScript before its content exists.")).toBeTruthy();
    // The heading arrived as a heading, with its hashes consumed.
    expect(screen.queryByText("## When to use")).toBeNull();
    // Inline code kept its own element rather than its backticks.
    expect(screen.getByText("bun").tagName).toBe("CODE");
  });

  it("shows the raw file when asked for Source", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    fireEvent.click(await screen.findByRole("button", { name: "View source" }));

    const raw = await screen.findByTestId("asset-source");
    expect(raw.textContent).toBe(DOC);
    expect(screen.queryByText("When to use")).toBeNull();
    expect(screen.getByRole("button", { name: "View source" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("surfaces the fields the Agent Skills standard defines", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    expect(await screen.findByText("License")).toBeTruthy();
    // The meta row and the Source tab must not share a word.
    expect(screen.getByText("Origin")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
    const caps = screen.getByText("Capabilities").closest("section")!;
    const rows = Array.from(caps.querySelectorAll('[data-testid="capability-row"]')).map((r) => r.textContent);
    expect(rows).toEqual(["Read", "BashShell access"]);
    expect(screen.queryByText("Allowed tools")).toBeNull();
  });

  it("names the projects the source reaches, and measures the file it actually read", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    expect(await screen.findByText("Linked into")).toBeTruthy();
    expect(screen.getByText("mei-recipes, metrics-board")).toBeTruthy();
    expect(screen.getByText("431 B · 21 lines")).toBeTruthy();
  });

  it("opens the file in its editor", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    fireEvent.click(await screen.findByText("Open in editor"));
    await waitFor(() => {
      expect(openPath).toHaveBeenCalledWith(SOURCE);
    });
  });

  it("offers the link flow only when one is given", async () => {
    const onLink = vi.fn();
    const { unmount } = render(<AssetDetail asset={asset} inventory={inventory} onLink={onLink} />);
    fireEvent.click(await screen.findByText("Link to…"));
    expect(onLink).toHaveBeenCalled();
    unmount();

    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByText("Open in editor");
    expect(screen.queryByText("Link to…")).toBeNull();
  });

  it("shows the document it read, not the folder it was handed", async () => {
    // A skill is identified by its folder, so that is what the panel receives.
    // Showing a directory above a rendered file reads as a mistake.
    const folder = "/home/me/.agents/skills/agent-browser";
    bodyPath = `${folder}/SKILL.md`;
    render(<AssetDetail asset={{ ...asset, path: folder }} inventory={inventory} />);

    expect(await screen.findByTitle(`${folder}/SKILL.md`)).toBeTruthy();
    fireEvent.click(screen.getByText("Open in editor"));
    await waitFor(() => {
      expect(openPath).toHaveBeenCalledWith(`${folder}/SKILL.md`);
    });
  });

  it("formats a tool's config instead of reading braces as prose", async () => {
    bodyResult = { ok: true, text: '{"mcpServers":{"node":{"command":"node run"}}}' };
    render(
      <AssetDetail
        asset={{ ...asset, category: "Tools", name: "node", path: "/home/me/.mcp.json" }}
        inventory={{ ...inventory, skills: [] }}
      />
    );

    const formatted = await screen.findByTestId("asset-formatted");
    expect(formatted.textContent).toContain('"mcpServers"');
    // Re-indented, not the single line it arrived as.
    expect(formatted.textContent!.split("\n").length).toBeGreaterThan(3);
  });

  it("still shows a config it cannot format, rather than nothing", async () => {
    bodyResult = { ok: true, text: "{ not json, mid-edit" };
    render(
      <AssetDetail
        asset={{ ...asset, category: "Tools", name: "node", path: "/home/me/.mcp.json" }}
        inventory={{ ...inventory, skills: [] }}
      />
    );

    expect((await screen.findByTestId("asset-source")).textContent).toBe("{ not json, mid-edit");
    // Nothing to switch between when only one view exists.
    expect(screen.queryByRole("button", { name: "View source" })).toBeNull();
  });

  it("does not invent a document for an agent, which has no file of its own", async () => {
    render(
      <AssetDetail
        asset={{ ...asset, category: "Agents", name: "claude", path: "/home/me/.claude" }}
        inventory={{ ...inventory, skills: [] }}
      />
    );

    await screen.findByText("Open in editor");
    expect(invoke).not.toHaveBeenCalledWith("read_asset_body", expect.anything());
    expect(screen.queryByRole("tab", { name: "Content" })).toBeNull();
    expect(screen.queryByText("Reading the file…")).toBeNull();
  });

  it("says why when the file cannot be read, and still shows what it knows", async () => {
    bodyResult = { ok: false, error: "Refusing to read a file outside the folders Hanger scans" };
    render(<AssetDetail asset={asset} inventory={inventory} />);

    expect(await screen.findByText(/Refusing to read a file outside/)).toBeTruthy();
    openDetails();
    // The relationships do not depend on the file's contents.
    expect(screen.getByText("The source for 2 copies")).toBeTruthy();
    expect(screen.getByText("Linked into")).toBeTruthy();
    // With no document there is nothing to switch between.
    expect(screen.queryByRole("button", { name: "View source" })).toBeNull();
  });

  it("the Engine row's mark matches the asset's own scope agent, not a generic glyph", () => {
    // The fixture `asset` above has no scope, so its Engine row reads "Any
    // agent" and draws no mark at all — not a useful case for this check.
    // This scoped variant pins the row to a real, unambiguous agent.
    const scopedAsset = { ...asset, scope: { Global: { agent: "claude" } } };
    render(<AssetDetail asset={scopedAsset} inventory={inventory} />);
    openDetails();

    const engineDt = screen.getByText("Engine");
    const engineDd = engineDt.nextElementSibling as HTMLElement;
    expect(engineDd.textContent).toBe("Claude Code");
    expect(engineDd.querySelector("svg")?.getAttribute("data-brand")).toBe("claude_code");
  });

  it("opens on Content: the document in a card with its file row, Details a tab away", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    expect((await screen.findByRole("tab", { name: "Content" })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tablist", { name: "Inspector view" })).toBeTruthy();
    const panel = screen.getByRole("tabpanel");
    expect(panel.id).toBe("panel-content");
    // The file row names the document, in mono, with the source toggle at its end.
    expect(within(panel).getByText("SKILL.md").className).toContain("font-mono");
    expect(within(panel).getByRole("button", { name: "View source" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(panel).getByText("When to use")).toBeTruthy();
    // Details is not rendered until asked for.
    expect(screen.queryByText("License")).toBeNull();
    openDetails();
    expect(screen.getByRole("tabpanel").id).toBe("panel-details");
    expect(screen.getByText("License")).toBeTruthy();
  });

  it("Identity is one list card in the ruled order, with Modified from the file's mtime", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = screen.getByText("Identity").closest("section")!;
    const rows = Array.from(section.querySelectorAll('[data-testid^="identity-row-"]')).map((r) => r.getAttribute("data-testid"));
    expect(rows).toEqual([
      "identity-row-engine", "identity-row-scope", "identity-row-linked-into", "identity-row-origin",
      "identity-row-version", "identity-row-size", "identity-row-modified", "identity-row-license",
    ]);
    expect(within(section).getByText("Modified").nextElementSibling?.textContent).toBe("Jul 20, 2026");
    expect(within(section).getByText("Size").nextElementSibling?.textContent).toBe("431 B · 21 lines");
    expect(section.querySelector("dl")).toBeNull();
  });

  it("omits the Modified row when the file has no mtime, rather than inventing an epoch date", async () => {
    bodyModifiedMs = null;
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = screen.getByText("Identity").closest("section")!;
    const rows = Array.from(section.querySelectorAll('[data-testid^="identity-row-"]')).map((r) => r.getAttribute("data-testid"));
    expect(rows).not.toContain("identity-row-modified");
    expect(within(section).queryByText("Modified")).toBeNull();
    expect(screen.queryByText("Jan 1, 1970")).toBeNull();
    // Size still renders — only the unmeasurable field is dropped.
    expect(within(section).getByText("Size").nextElementSibling?.textContent).toBe("431 B · 21 lines");
  });

  it("lists what else is in the skill's folder, folders with their file counts", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = (await screen.findByText("Contents")).closest("section")!;
    const rows = Array.from(section.querySelectorAll('[data-testid="skill-dir-row"]')).map((r) => r.textContent);
    expect(rows).toEqual(["SKILL.md431 B", "references/3 files", "scripts/1 file"]);
  });

  it("a symlinked entry takes the link mark and states no size it never measured", async () => {
    // 90f0f8a: list_asset_dir stops following symlinks, so an entry that is
    // one arrives with kind: "symlink" and no bytes or file_count.
    dirResult = [
      { name: "SKILL.md", kind: "file", bytes: 431, file_count: null },
      { name: "escape", kind: "symlink", bytes: null, file_count: null },
    ];
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = (await screen.findByText("Contents")).closest("section")!;
    const rows = Array.from(section.querySelectorAll('[data-testid="skill-dir-row"]'));
    const symlinkRow = rows.find((r) => r.textContent?.startsWith("escape")) as HTMLElement;
    expect(symlinkRow).toBeTruthy();
    // The em dash this app already uses for "not known" (the MCP tools
    // table's Schema column) — not "0 B", which would state a size nobody
    // measured.
    expect(symlinkRow.textContent).toBe("escape—");
    expect(symlinkRow.textContent).not.toContain("0 B");
    // LinkIcon, not DocumentIcon: unique path data from @heroicons LinkIcon.
    expect(symlinkRow.querySelector("svg")?.outerHTML).toContain("M13.19 8.688");
  });

  it("draws no folder section for a rule, and none when the folder cannot be listed", async () => {
    dirResult = [];
    render(<AssetDetail asset={{ ...asset, category: "Rules", path: "/home/me/.agents/rules/x.md" }} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    expect(screen.queryByText("Contents")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("list_asset_dir", expect.anything());
  });

  it("Content leads with what reading the skill costs, bytes as the fact and tokens as an estimate", async () => {
    bodyFigures = { bytes: 8602, lines: 252, estimated_tokens: 2150 };
    render(<AssetDetail asset={asset} inventory={inventory} />);
    const section = (await screen.findByText("Context")).closest("section")!;
    expect(section.textContent).toContain("Name and description always loaded · 8.4 kB when opened");
    expect(section.textContent).toContain("≈ 2,150 tokens, estimated · not checked per engine");
    // It precedes the document card.
    const panel = screen.getByRole("tabpanel");
    expect(panel.firstElementChild).toBe(section);
  });
  it("a rule has no Context section — the tiers are a skill's", async () => {
    render(<AssetDetail asset={{ ...asset, category: "Rules" }} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Content" });
    expect(screen.queryByText("Context")).toBeNull();
  });
});
