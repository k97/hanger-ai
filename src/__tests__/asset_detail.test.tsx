// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import AssetDetail from "../components/AssetDetail";
import type { Inventory } from "../App";
import { invoke } from "@tauri-apps/api/core";

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
let bodyFigures: {
  bytes: number;
  lines: number;
  estimated_tokens: number;
  always_on_bytes: number | null;
  always_on_estimated_tokens: number | null;
} = {
  bytes: 431,
  lines: 21,
  estimated_tokens: 107,
  always_on_bytes: 228,
  // Deliberately not always_on_bytes / 4 (which is 57): a component that
  // divided the byte figure instead of rendering the backend's own token
  // estimate would still pass every test that uses this default.
  always_on_estimated_tokens: 84,
};
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

const writeText = vi.fn(async () => {});

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
    bodyFigures = {
      bytes: 431,
      lines: 21,
      estimated_tokens: 107,
      always_on_bytes: 228,
      // Same reasoning as the module-level default above: not
      // always_on_bytes / 4.
      always_on_estimated_tokens: 84,
    };
    bodyModifiedMs = Date.UTC(2026, 6, 20, 12);
    dirResult = [
      { name: "SKILL.md", kind: "file", bytes: 431, file_count: null },
      { name: "references/", kind: "dir", bytes: null, file_count: 3 },
      { name: "scripts/", kind: "dir", bytes: null, file_count: 1 },
    ];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  // "states the file's relationships in one line" removed: the state line
  // (the dot + "The source for N copies" statement) moved to the cap's kind
  // glyph. Successor: InspectorCap.test.tsx, "marks the kind glyph with a
  // state dot only when the asset has findings".

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
    // Was also asserting the Origin row's label here ("Origin", not
    // "Source" — the meta row and the Source tab must not share a word).
    // Dropped 2026-08-27: `asset` below carries no `origin`/`origin_blocked`,
    // and `originRow` now returns null for that ordinary case, so the row
    // no longer renders for this fixture. AssetDetailOrigin.test.tsx covers
    // the row's presence and content against fixtures that do carry one.
    expect(screen.getByText("MIT")).toBeTruthy();
    const caps = screen.getByText("Capabilities").closest("section")!;
    const rows = Array.from(caps.querySelectorAll('[data-testid="capability-row"]')).map((r) => r.textContent);
    expect(rows).toEqual(["Read", "BashShell access"]);
    expect(screen.queryByText("Allowed tools")).toBeNull();
  });

  // Was also "and measures the file it actually read", asserting
  // `screen.getByText("431 B · 21 lines")` — Identity's Size row, removed
  // 2026-08-27 (Contents and the Context ledger already carry the bytes).
  // Karthik's ruling, 2026-08-27: Compatibility and Metadata are dropped
  // from the Identity summary. Metadata always rendered blank — the
  // frontmatter parser (`skillDocument.ts`) is line-based and reads a key
  // with no inline value as opening a LIST, so a YAML map under `metadata:`
  // always stores an empty array, leaking its sub-keys out as separate
  // top-level frontmatter entries. Compatibility is free prose with no
  // length contract and reads as an essay in a table row even parsed
  // correctly. Both stay reachable: the Content tab's Source view still
  // shows the raw frontmatter, so nothing about the asset becomes
  // unreadable, only absent from the summary card.
  it("drops Compatibility and Metadata from Identity; License stays; both remain readable in Source", async () => {
    bodyResult = {
      ok: true,
      text: [
        "---",
        "name: agent-browser",
        "description: Drives a Chromium instance over CDP.",
        "license: MIT",
        "compatibility: Requires Node 18+ and a Chromium build with remote debugging enabled on macOS and Linux.",
        "metadata:",
        "  author: someone",
        "  version: 3",
        "---",
        "",
        "# agent-browser",
      ].join("\n"),
    };
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = screen.getByText("Identity").closest("section")!;
    expect(within(section).queryByText("Compatibility")).toBeNull();
    expect(within(section).queryByText("Metadata")).toBeNull();
    expect(within(section).queryByTestId("identity-row-compatibility")).toBeNull();
    expect(within(section).queryByTestId("identity-row-metadata")).toBeNull();
    expect(within(section).getByText("MIT")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Content" }));
    fireEvent.click(screen.getByRole("button", { name: "View source" }));
    const raw = screen.getByTestId("asset-source");
    expect(raw.textContent).toContain("compatibility:");
    expect(raw.textContent).toContain("metadata:");
  });

  it("names the projects the source reaches", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    expect(await screen.findByText("Linked into")).toBeTruthy();
    expect(screen.getByText("mei-recipes, metrics-board")).toBeTruthy();
  });

  // "opens the file in its editor" removed: Open in editor moved to the
  // cap's overflow menu. Successor: InspectorCap.test.tsx, "wires the menu's
  // Open in editor item to onOpenInEditor, and only onOpenInEditor".

  // "offers the link flow only when one is given" removed: Link to… moved to
  // the cap. Successor: InspectorCap.test.tsx, "orders the trailing cluster
  // Link to…, More actions, Expand inspector, Toggle inspector" (presence)
  // and "renders no Link to… and no overflow menu for an MCP asset with none
  // of the menu callbacks" (absence).

  it("shows the document it read, not the folder it was handed", async () => {
    // A skill is identified by its folder, so that is what the panel receives.
    // Showing a directory above a rendered file reads as a mistake. The path
    // now renders in Details › Identity, not in an always-visible chip.
    const folder = "/home/me/.agents/skills/agent-browser";
    bodyPath = `${folder}/SKILL.md`;
    render(<AssetDetail asset={{ ...asset, path: folder }} inventory={inventory} />);

    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    expect(await screen.findByTitle(`${folder}/SKILL.md`)).toBeTruthy();
  });

  it("formats a tool's config instead of reading braces as prose", async () => {
    bodyResult = { ok: true, text: '{"mcpServers":{"node":{"command":"node run"}}}' };
    render(
      <AssetDetail
        asset={{ ...asset, category: "Tools", name: "node", path: "/home/me/.mcp.json" }}
        inventory={{ ...inventory, skills: [] }}
      />
    );

    const formatted = await screen.findByTestId("skill-body");
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

    // Open in editor moved to the cap; Identity — always shown, never
    // tab-gated, for a kind with no document — is what proves this
    // rendered rather than silently rendering nothing.
    await screen.findByText("Identity");
    expect(invoke).not.toHaveBeenCalledWith("read_asset_body", expect.anything());
    expect(screen.queryByRole("tab", { name: "Content" })).toBeNull();
    expect(screen.queryByText("Reading the file…")).toBeNull();
  });

  it("says why when the file cannot be read, and still shows what it knows", async () => {
    bodyResult = { ok: false, error: "Refusing to read a file outside the folders Hanger scans" };
    render(<AssetDetail asset={asset} inventory={inventory} />);

    // Reading: the file-text mark scans (looping) while read_asset_body is
    // still in flight, before its promise has settled either way.
    const readingLine = screen.getByText("Reading the file…").closest("p")!;
    expect(readingLine.querySelector('path[d="M10 9H8"]')).toBeTruthy();
    // aim-loop sits on the animating element itself, not a wrapping <g> —
    // file-text is one of the ten stagger marks (finding 1, final review).
    expect(readingLine.querySelector(".aim-loop")).toBeTruthy();

    expect(await screen.findByText(/Refusing to read a file outside/)).toBeTruthy();
    openDetails();
    // The relationships do not depend on the file's contents. (The state
    // line itself — "The source for 2 copies" — moved to the cap; this
    // panel no longer restates it in prose.)
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

  // Clicking down a table with Details open should keep answering the same
  // question. The tab used to reset with the body-load effect, so every row
  // snapped back to the document.
  it("keeps the open tab when the inspector moves to another asset", async () => {
    const { rerender } = render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    expect(screen.getByRole("tabpanel").id).toBe("panel-details");

    const other = { ...asset, name: "other-skill", path: "/home/me/.agents/skills/other-skill/SKILL.md" };
    bodyPath = other.path;
    rerender(<AssetDetail asset={other} inventory={inventory} />);
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true"),
    );
    expect(screen.getByRole("tabpanel").id).toBe("panel-details");
  });

  it("Identity is one list card in the ruled order, with Modified from the file's mtime", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = screen.getByText("Identity").closest("section")!;
    const rows = Array.from(section.querySelectorAll('[data-testid^="identity-row-"]')).map((r) => r.getAttribute("data-testid"));
    // No "identity-row-origin": `asset` below carries no `origin` and no
    // `origin_blocked`, and `originRow` now returns null for that ordinary
    // case (2026-08-27) — the row is dropped rather than restating what the
    // Path row already says. No "identity-row-size": the byte count/line
    // count row was removed the same day; Contents and the Context ledger
    // already carry the bytes.
    expect(rows).toEqual([
      "identity-row-engine", "identity-row-scope", "identity-row-linked-into",
      "identity-row-version", "identity-row-modified", "identity-row-license",
      "identity-row-path",
    ]);
    expect(within(section).getByText("Modified").nextElementSibling?.textContent).toBe("Jul 20, 2026");
    expect(within(section).queryByText("Size")).toBeNull();
    expect(section.querySelector("dl")).toBeNull();
  });

  // Pins the word itself, not just the row's presence: `rows` above only
  // asserts the testid `identity-row-path` (derived from the row's `key`,
  // never its `label`) is in the right slot, so a reviewer found relabelling
  // "Path" to "File path" — signed-off copy (the plan's copy table,
  // "Details › Identity, new row") — left that test and inspector_avionics
  // fully green.
  it("labels the last Identity row exactly \"Path\" — the word Karthik signed off, not a paraphrase", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = screen.getByText("Identity").closest("section")!;
    const pathRow = within(section).getByTestId("identity-row-path");
    expect(within(pathRow).getByText("Path")).toBeTruthy();
  });

  it("the Path row carries a Copy path control", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const pathRow = screen.getByTestId("identity-row-path");
    expect(within(pathRow).getByRole("button", { name: "Copy path" })).toBeTruthy();
  });

  it("copies shownPath — the document actually read, not the folder asset.path names — when Copy path is clicked", async () => {
    // Mirrors "shows the document it read, not the folder it was handed":
    // for a skill, asset.path is the containing folder while the backend's
    // read_asset_body resolves the file one level in.
    const folder = "/home/me/.agents/skills/agent-browser";
    const file = `${folder}/SKILL.md`;
    bodyPath = file;
    render(<AssetDetail asset={{ ...asset, path: folder }} inventory={inventory} />);

    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const pathRow = await screen.findByTestId("identity-row-path");
    fireEvent.click(within(pathRow).getByRole("button", { name: "Copy path" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(file);
    });
    expect(writeText).not.toHaveBeenCalledWith(folder);
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
    // The rest of the card still renders — only the unmeasurable field is
    // dropped. (Was "Size still renders"; that row was removed 2026-08-27 —
    // Path is the row left after it in the ruled order.)
    expect(rows).toContain("identity-row-path");
  });

  it("lists what else is in the skill's folder, folders with their file counts", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = (await screen.findByText("Contents")).closest("section")!;
    const rows = Array.from(section.querySelectorAll('[data-testid="skill-dir-row"]')).map((r) => r.textContent);
    expect(rows).toEqual(["SKILL.md431 B", "references/3 files", "scripts/1 file"]);
  });

  // "Only SKILL.md is read into context" is a fact about the harness, not
  // about the asset on screen — true of every skill, so the panel was
  // restating it on every asset opened. Karthik's ruling, 2026-08-28: it
  // belongs in docs/harness.md, not the UI. Asserted for BOTH folder shapes,
  // because it was previously conditional on there being other entries and a
  // partial revert would restore it for exactly the multi-entry case.
  const NOTE = /Only SKILL\.md is read into context/;

  it("carries no harness prose under Contents, whatever the folder holds", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const many = (await screen.findByText("Contents")).closest("section")!;
    expect(within(many).getAllByTestId("skill-dir-row").length).toBeGreaterThan(1);
    expect(within(many).queryByText(NOTE)).toBeNull();

    cleanup();
    dirResult = [{ name: "SKILL.md", kind: "file", bytes: 431, file_count: null }];
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const one = (await screen.findByText("Contents")).closest("section")!;
    expect(within(one).getAllByTestId("skill-dir-row")).toHaveLength(1);
    expect(within(one).queryByText(NOTE)).toBeNull();
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

  // Split from one case that claimed both. It set `dirResult = []` AND
  // switched the category to Rules — but the category switch alone makes the
  // effect return before `invoke` (`AssetDetail.tsx:202`), so the assertion
  // passed whatever `dirResult` held and the empty-list branch for a genuine
  // Skills asset was never reached.
  it("draws no folder section for a rule, and does not even ask for a listing", async () => {
    render(<AssetDetail asset={{ ...asset, category: "Rules", path: "/home/me/.agents/rules/x.md" }} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    expect(screen.queryByText("Contents")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("list_asset_dir", expect.anything());
  });

  it("asks for the listing of a skill whose folder is empty, and draws no Contents over nothing", async () => {
    dirResult = [];
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    // The command HAVING been called is the half the old case could not
    // reach: it is what distinguishes "listed, and empty" from "never asked".
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_asset_dir", { path: SOURCE }));
    expect(screen.queryByText("Contents")).toBeNull();
    expect(screen.queryAllByTestId("skill-dir-row")).toHaveLength(0);
  });

  // Was also asserting the "Only SKILL.md is read into context" prose here.
  // Dropped 2026-08-28 with the sentence itself — it is a fact about the
  // harness rather than the asset, and now lives in docs/harness.md. The ink
  // treatment below is what still carries that meaning in the UI: every
  // entry BUT SKILL.md's recedes to secondary ink, because SKILL.md is the
  // one that always loads. The prose's absence is pinned by its own test
  // above.
  it("sets every entry's size except SKILL.md's in secondary ink", async () => {
    // `references/` and `scripts/` (the default fixture's other two entries)
    // are directories: their value is a file count, not a size, so they
    // never reach the size ternary this test pins and would make the "every
    // other entry" half vacuous. A second FILE is what actually exercises
    // the non-SKILL.md branch.
    dirResult = [
      { name: "SKILL.md", kind: "file", bytes: 431, file_count: null },
      { name: "reference.md", kind: "file", bytes: 128, file_count: null },
    ];
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Details" });
    openDetails();
    const section = (await screen.findByText("Contents")).closest("section")!;
    // Class-contract only: happy-dom lays nothing out, so computed color is
    // unassertable here. This checks the secondary-ink class landed on the
    // size figure of every entry but SKILL.md's, not that it renders
    // visibly lighter — that needs a real-build screenshot. Scoped to the
    // size text itself (not the row) because the row's own folder/file icon
    // is always --ink-3, which would make a row-wide search true regardless
    // of which entry it is.
    expect(within(section).getByText("431 B").className).not.toContain("text-ink-3");
    expect(within(section).getByText("128 B").className).toContain("text-ink-3");
  });

  it("Context is a two-tier ledger: always-on and on-open, tokens leading, bytes beneath", async () => {
    bodyFigures = {
      bytes: 8602,
      lines: 252,
      // Deliberately not bytes / 4 (which floors to 2,150): the UI copy
      // asserted below states that rule as how the backend derived the
      // figure, but the component itself only ever renders
      // body.estimated_tokens -- it must not be reconstructible from bytes
      // alone, or a component that divided instead of reading the field
      // would pass unnoticed.
      estimated_tokens: 2400,
      always_on_bytes: 228,
      // Same reasoning: not always_on_bytes / 4 (57).
      always_on_estimated_tokens: 91,
    };
    render(<AssetDetail asset={asset} inventory={inventory} />);
    const section = (await screen.findByText("Context")).closest("section")!;
    expect(section.textContent).toContain("Always on");
    expect(section.textContent).toContain("Name and description, in every engine’s startup list");
    expect(section.textContent).toContain("≈ 91 tokens");
    expect(section.textContent).toContain("228 B");
    expect(section.textContent).toContain("When it opens");
    expect(section.textContent).toContain("SKILL.md in full, frontmatter included");
    expect(section.textContent).toContain("≈ 2,400 tokens");
    expect(section.textContent).toContain("8.4 kB");
    // How the figures were derived is a footnote, not a finding: it sits
    // behind the header's info trigger rather than under the ledger, where a
    // sentence read once outweighed the numbers it qualifies.
    expect(section.textContent).not.toContain("bytes divided by four");
    fireEvent.click(within(section).getByRole("button", { name: "About the context figures" }));
    expect(within(section).getByRole("note").textContent).toBe(
      "Token figures are bytes divided by four. Every engine tokenises differently, so " +
        "treat them as a size, not a count."
    );
    expect(section.textContent).not.toContain("not checked per engine");
    // It precedes the document card.
    const panel = screen.getByRole("tabpanel");
    expect(panel.firstElementChild).toBe(section);
  });
  it("the always-on row is absent when the backend could not measure it", async () => {
    bodyFigures = {
      bytes: 8602,
      lines: 252,
      estimated_tokens: 2150,
      always_on_bytes: null,
      always_on_estimated_tokens: null,
    };
    render(<AssetDetail asset={asset} inventory={inventory} />);
    const section = (await screen.findByText("Context")).closest("section")!;
    expect(section.textContent).not.toContain("Always on");
    expect(section.textContent).toContain("When it opens");
  });
  it("a rule has no Context section — the tiers are a skill's", async () => {
    render(<AssetDetail asset={{ ...asset, category: "Rules" }} inventory={inventory} />);
    await screen.findByRole("tab", { name: "Content" });
    expect(screen.queryByText("Context")).toBeNull();
  });

  it("section heads are sentence-case body medium, not uppercase eyebrows", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    const head = await screen.findByText("Context");
    expect(head.className).toContain("text-base-app");
    expect(head.className).toContain("font-medium");
    expect(head.className).not.toContain("uppercase");
    expect(head.className).not.toContain("tracking-[.06em]");
  });

  // The "first" pre in source order (the pretty/formatted branch) is the one
  // this task's brief names, but that branch is unreachable through a Skills
  // fixture: `documentKindFor` gives Skills/Rules/Subagents kind "markdown",
  // and `pretty` is only ever computed for kind "json" (AssetDetail.tsx's
  // `text !== null && kind === "json"` guard) — so a skill's own body always
  // reaches `MarkdownDoc`, never this `<pre>`. A Tools/JSON asset with text
  // that parses is the only fixture that renders it, matching the sibling
  // test "formats a tool's config instead of reading braces as prose".
  it("renders the formatted body at 12px mono in --ink-1 with code leading", async () => {
    bodyResult = { ok: true, text: '{"mcpServers":{"node":{"command":"node run"}}}' };
    render(
      <AssetDetail
        asset={{ ...asset, category: "Tools", name: "node", path: "/home/me/.mcp.json" }}
        inventory={{ ...inventory, skills: [] }}
      />
    );
    const pre = await screen.findByTestId("skill-body");
    expect(pre.className).toContain("text-small");
    expect(pre.className).toContain("text-ink-1");
    expect(pre.className).toContain("leading-code");
    expect(pre.className).not.toContain("leading-[1.6]");
  });
});
