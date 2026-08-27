// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import ProfilePane from "./ProfilePane";
import { Inventory } from "../App";

afterEach(() => {
  cleanup();
});

// Mock mixed inventory with skills, tools, rules, and agents
const mockInventory: Inventory = {
  agents: [
    {
      id: "claude-code",
      name: "Claude Code",
      global_config_path: "/home/user/.claude",
      project_footprints: []
    }
  ],
  skills: [
    {
      id: "skill-1",
      name: "Claude Math Skill",
      description: "Math Solver",
      version: "1.0.0",
      path: "/home/user/.claude/skills/math",
      scope: { Global: { agent: "claude-code" } }
    }
  ],
  tools: [
    {
      id: "tool-1",
      name: "Node Runner Tool",
      command: "node",
      transport: "stdio",
      config_path: "/home/user/.claude/tools.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code"
    }
  ],
  rules: [
    {
      id: "rule-1",
      name: "CLAUDE.md",
      path: "/home/user/.claude/CLAUDE.md",
      content: "global rules",
      scope: { Global: { agent: "claude-code" } }
    }
  ],
  subagents: [],
  project_scans: []
};

describe("ProfilePane Component-Level Filtering Integration", () => {
  it("should update rendered lists correctly when category cards are toggled", () => {
    const handleSelectAsset = vi.fn();
    render(
      <ProfilePane
        inventory={mockInventory}
        loading={false}
        onSelectAsset={handleSelectAsset}
        onLinkAsset={vi.fn()}
      />
    );

    // Default view: all three assets (Skill, Tool, Rule) are present
    expect(screen.getByText("Claude Math Skill")).toBeTruthy();
    expect(screen.getByText("Node Runner Tool")).toBeTruthy();
    expect(screen.getByText("CLAUDE.md")).toBeTruthy();

    // Click on the MCP servers card
    const toolsCard = screen.getAllByText("MCP servers").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(toolsCard).toBeTruthy();
    fireEvent.click(toolsCard!);

    // Now, ONLY Node Runner Tool should be present. Skills and Rules must be absent!
    expect(screen.queryByText("Node Runner Tool")).toBeTruthy();
    expect(screen.queryByText("Claude Math Skill")).toBeNull();
    expect(screen.queryByText("CLAUDE.md")).toBeNull();

    // Click on "Skills" card
    const skillsCard = screen.getAllByText("Skills").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(skillsCard).toBeTruthy();
    fireEvent.click(skillsCard!);

    // Now, ONLY Claude Math Skill should be present. Tools and Rules must be absent!
    expect(screen.queryByText("Claude Math Skill")).toBeTruthy();
    expect(screen.queryByText("Node Runner Tool")).toBeNull();
    expect(screen.queryByText("CLAUDE.md")).toBeNull();

    // Click on "Skills" card again to clear filter back to All
    fireEvent.click(skillsCard!);
    expect(screen.getByText("Claude Math Skill")).toBeTruthy();
    expect(screen.getByText("Node Runner Tool")).toBeTruthy();
    expect(screen.getByText("CLAUDE.md")).toBeTruthy();
  });

  it("ProfilePane renders total and category card counts equal to get_asset_counts global counts", () => {
    const mockGlobalCounts = {
      total: 212,
      byCategory: {
        skill: { total: 244, global: 200, project: 44 },
        tool: { total: 10, global: 8, project: 2 },
        rule: { total: 5, global: 3, project: 2 },
        subagent: { total: 2, global: 1, project: 1 },
      },
    };

    render(
      <ProfilePane
        inventory={mockInventory}
        assetCounts={mockGlobalCounts}
        loading={false}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );

    // Chips render "{label}{count}" — the count span carries the global figure.
    const skillsCard = screen.getAllByText("Skills").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(skillsCard?.textContent).toBe("Skills200");

    const toolsCard = screen.getAllByText("MCP servers").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(toolsCard?.textContent).toBe("MCP servers8");

    const rulesCard = screen.getAllByText("Rules").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(rulesCard?.textContent).toBe("Rules3");

    const subagentsCard = screen.getAllByText("Subagents").find(el => el.closest("[tabindex]"))?.closest("[tabindex]");
    expect(subagentsCard?.textContent).toBe("Subagents1");
  });

  it("the category track sits above the strip — the control above what it changes", () => {
    render(<ProfilePane inventory={mockInventory} loading={false} onSelectAsset={vi.fn()} onLinkAsset={vi.fn()} />);
    const track = screen.getByRole("tablist", { name: "Filter by category" });
    const strip = screen.getByLabelText("Inventory summary");
    expect(track.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The line above reads MARKUP order, which is all happy-dom has — it lays
    // nothing out and has no paint order (verification.md). So `order-2` on
    // the track flips what the user actually sees and leaves that line green;
    // planted, it passed all 806 tests, as did reverting the four spacing
    // values `2de751a` set, which nothing read either.
    //
    // What follows is a CLASS CONTRACT, not a paint-order assertion. It is the
    // honest substitute this environment can carry: pinning each wrapper's
    // exact class list means an `order` utility cannot be added without
    // failing here. A separate `not.toMatch(/order-/)` was written and then
    // removed — the assertion below fails first, so nothing could ever have
    // made that line fire. Real paint order stays a screenshot claim.
    const trackBox = track.parentElement!.parentElement!; // wrapper > section > tablist
    const stripBox = strip.parentElement!;
    // Siblings under one flex column, which is the only arrangement in which
    // an `order` utility would apply at all.
    expect(trackBox.parentElement).toBe(stripBox.parentElement);
    // Cited verbatim by DESIGN.md -> Pane composition; change them together.
    // `pt-1.5`, not the `pt-3.5` this carried until 2026-08-27: the cap is a
    // 40px band around 27px controls, so 6.5px of it is unpainted and
    // `pt-3.5` printed the first gap at 20.5px. 6 + 6.5 = 12.5, which is
    // Karthik's pick over 14.5 and 10.5 -- it lands the tab pill's top on
    // the rail mark's, both at 46. Measured on the live window, see
    // src/__tests__/shell_first_gap.test.tsx.
    expect(trackBox.className).toBe("px-[18px] pt-1.5 pb-3.5");
    expect(stripBox.className).toBe("mx-[18px] mb-3.5");
  });

  it("the strip follows the selected category: the skill count, the skill noun, the skill split", () => {
    const counts = { total: 3, byCategory: { skill: { total: 200, global: 200, project: 0 }, tool: { total: 8, global: 8, project: 0 }, rule: { total: 3, global: 3, project: 0 }, subagent: { total: 1, global: 1, project: 0 } }, engines: { "claude-code": 3 } };
    render(<ProfilePane inventory={mockInventory} assetCounts={counts} loading={false} onSelectAsset={vi.fn()} onLinkAsset={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Skills").find((el) => el.closest("[tabindex]"))!.closest("[tabindex]")!);
    const strip = screen.getByLabelText("Inventory summary");
    expect(within(strip).getByText("200")).toBeTruthy();
    expect(within(strip).getByText("skills in the global store · 1 engine")).toBeTruthy();
    // One global skill in the fixture, local: the split is the skill's alone.
    expect(within(strip).getByRole("img", { name: "0 linked, 0 drifted, 0 broken, 1 local only" })).toBeTruthy();
  });

  it("with MCP servers selected and the summary in hand, the strip is probe coverage and the pill filters disagreeing servers", () => {
    const counts = { total: 3, byCategory: { tool: { total: 2, global: 2, project: 0 } }, engines: {} };
    const mcpServers = [
      { name: "tauri", transport: "stdio", registration_count: 2, distinct_spec_count: 2, agreement: "Conflicting", aliased_with: [], plugin: null, registrations: ["/a:tauri", "/b:tauri"] },
      { name: "spades", transport: "stdio", registration_count: 1, distinct_spec_count: 1, agreement: "Consistent", aliased_with: [], plugin: null, registrations: ["/a:spades"] },
    ];
    const summary = { rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 2, tools_known: 4 }], total_server_count: 3, answered_server_count: 1, unasked_server_count: 2, unaskable_server_count: 0, conflicting_server_count: 1 };
    render(<ProfilePane inventory={mockInventory} assetCounts={counts} mcpServers={mcpServers as never} serverGrouping="server" serverSort="name" mcpEngineSummary={summary} mcpCoverage={{ checked_file_count: 16, checked_engine_count: 2, checked_files: [], problems: [] }} loading={false} onSelectAsset={vi.fn()} onLinkAsset={vi.fn()} />);
    fireEvent.click(screen.getAllByText("MCP servers").find((el) => el.closest("[tabindex]"))!.closest("[tabindex]")!);
    const strip = screen.getByLabelText("Inventory summary");
    // Not `getByText("2")`: this fixture's "not yet asked" figure is also 2,
    // and SummaryStrip (S5) renders each legend bucket's number in its own
    // element — a plain text query for "2" matches both and throws. Scoped
    // to the headline's own class disambiguates without changing either
    // figure.
    expect(strip.querySelector(".text-display")?.textContent).toBe("2");
    expect(within(strip).getByText("MCP servers registered · 16 host configs read")).toBeTruthy();
    expect(within(strip).getByRole("img", { name: "1 answered, 2 not yet asked, 0 can't be asked" })).toBeTruthy();
    expect(screen.getByText("tauri")).toBeTruthy();
    expect(screen.getByText("spades")).toBeTruthy();
    fireEvent.click(within(strip).getByText("Needs review 1"));
    expect(screen.getByText("tauri")).toBeTruthy();
    expect(screen.queryByText("spades")).toBeNull();
    fireEvent.click(within(strip).getByText("Needs review 1"));
    expect(screen.getByText("spades")).toBeTruthy();
  });

  it("clears the Review filter when the category changes, so it never carries back to Tools", () => {
    const counts = { total: 3, byCategory: { tool: { total: 2, global: 2, project: 0 } }, engines: {} };
    const mcpServers = [
      { name: "tauri", transport: "stdio", registration_count: 2, distinct_spec_count: 2, agreement: "Conflicting", aliased_with: [], plugin: null, registrations: ["/a:tauri", "/b:tauri"] },
      { name: "spades", transport: "stdio", registration_count: 1, distinct_spec_count: 1, agreement: "Consistent", aliased_with: [], plugin: null, registrations: ["/a:spades"] },
    ];
    const summary = { rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 2, tools_known: 4 }], total_server_count: 3, answered_server_count: 1, unasked_server_count: 2, unaskable_server_count: 0, conflicting_server_count: 1 };
    render(<ProfilePane inventory={mockInventory} assetCounts={counts} mcpServers={mcpServers as never} serverGrouping="server" serverSort="name" mcpEngineSummary={summary} mcpCoverage={{ checked_file_count: 16, checked_engine_count: 2, checked_files: [], problems: [] }} loading={false} onSelectAsset={vi.fn()} onLinkAsset={vi.fn()} />);
    const card = (label: string) =>
      screen.getAllByText(label).find((el) => el.closest("[tabindex]"))!.closest("[tabindex]")!;
    const pill = () => within(screen.getByLabelText("Inventory summary")).getByText("Needs review 1");

    fireEvent.click(card("MCP servers"));
    fireEvent.click(pill());
    // The filter is genuinely on before the category moves — without this the
    // rest could pass vacuously against a pill that never applied.
    expect(screen.queryByText("spades")).toBeNull();
    expect(pill().getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(card("Skills"));
    fireEvent.click(card("MCP servers"));

    // Both halves: the pill is unpressed AND the list it gates is unfiltered.
    // Asserting only the row would pass a reset that left the pill lit.
    expect(pill().getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("spades")).toBeTruthy();
    expect(screen.getByText("tauri")).toBeTruthy();
  });
});

describe("ProfilePane — the empty state is a finding, not a default", () => {
  const renderGlobal = (over: Partial<React.ComponentProps<typeof ProfilePane>>) =>
    render(
      <ProfilePane
        inventory={null}
        loading={false}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
        {...over}
      />
    );

  it("makes no claim before the first scan completes", () => {
    // Seen 2026-08-16: the first scan on a fresh store rendered a headline
    // denying the engine folders existed while the sidebar showed their marks.
    renderGlobal({ loading: true, scannedAt: null });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    // "once the scan finishes", not "as roots finish": inventory lands on
    // scan://complete only, so nothing here fills in root by root.
    expect(screen.getByText("Assets in the global store show up here once the scan finishes.")).toBeTruthy();
    expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
    // Scanning: the disc, looping — the arc plus the loop rule together are
    // what tell it apart from the idle folder-clock below.
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M6 12c0-1.7.7-3.2 1.8-4.2"]')
    ).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeTruthy();
  });

  it("with no scan running and none finished, says so rather than 'nothing here'", () => {
    renderGlobal({ loading: false, scannedAt: null });
    // The strip's stamp says the same words; the claim under test is the plane's.
    expect(within(screen.getByTestId("scan-pending")).getByText("Not scanned yet")).toBeTruthy();
    expect(screen.getByText("Rescan when you're ready.")).toBeTruthy();
    expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
    // Idle: the folder-clock's hands, played once — never looping, so a
    // stopped scan never reads as a frozen spinner.
    expect(screen.getByTestId("scan-pending").querySelector('path[d="M16 14v2l1 1"]')).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeNull();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-once")).toBeTruthy();
  });

  it("claims the store is empty only after a completed scan finds nothing", () => {
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
    });
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("No engine folders on this machine yet")).toBeTruthy();
  });

  it("names the right absence: engine folders present, nothing in them — and names the engines", () => {
    // The headline is decided by the filesystem probe (get_detected_engines),
    // not by assetCounts.engines — that map is built from asset rows and is
    // empty whenever the store is, so it cannot tell these two states apart.
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [{ id: "claude", name: "Claude Code" }, { id: "gemini", name: "Gemini CLI" }],
    });
    expect(screen.getByText("Nothing in the global store yet")).toBeTruthy();
    // The WHOLE subline, not a prefix. The old regex stopped before the final
    // full stop, so it could not see what came after it — and what came after
    // it was "Discovery lists places to find some.", cut on Karthik's ruling
    // (T6) because an empty state should report a finding, not sell a pane.
    // Anchored so putting a sentence back fails here rather than shipping.
    expect(
      screen.getByText(
        "Claude Code and Gemini CLI are here, but their global folders hold no skills, rules, MCP servers or subagents yet."
      )
    ).toBeTruthy();
    expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
    // Engines are here, tracked and empty — the open package, not the crossed
    // folder the next test's "no engines at all" state wears.
    expect(
      screen
        .getByText("Nothing in the global store yet")
        .closest("div")
        ?.querySelector('path[d="M12 22v-9"]')
    ).toBeTruthy();
  });

  it("one engine reads in the singular", () => {
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [{ id: "codex", name: "Codex" }],
    });
    expect(screen.getByText(/Codex is here, but its global folder holds no/)).toBeTruthy();
  });

  it("names the right absence: no engine folders at all", () => {
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [],
      knownEngines: [
        { id: "claude-code", name: "Claude Code" },
        { id: "codex", name: "Codex" },
      ],
    });
    expect(screen.getByText("No engine folders on this machine yet")).toBeTruthy();
    expect(screen.getByText(/Run one of them once, then rescan/)).toBeTruthy();
    expect(screen.queryByText("Nothing in the global store yet")).toBeNull();
    // No engines at all — the crossed folder, not the open package above.
    expect(
      screen
        .getByText("No engine folders on this machine yet")
        .closest("div")
        ?.querySelector('path[d="m9.5 10.5 5 5"]')
    ).toBeTruthy();
  });

  it("the engines it says it looks for come from the backend, never a literal", () => {
    // This line named "Claude Code, Codex and Gemini" in the source and went
    // stale the day the backend's table grew to eight. A fictional roster
    // proves the sentence is rendering the prop, not a string in the file.
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [],
      knownEngines: [
        { id: "a", name: "Aardvark" },
        { id: "b", name: "Bandicoot" },
        { id: "c", name: "Capybara" },
      ],
    });
    expect(
      screen.getByText(
        /Hanger looks in your home directory for the folders Aardvark, Bandicoot and Capybara keep there/
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Claude Code/)).toBeNull();
  });

  it("says something sane if the roster has not arrived yet", () => {
    // get_known_engines is fetched on mount and can lose the race, or fail.
    // The sentence drops the list rather than naming an empty one.
    renderGlobal({
      loading: false,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
      detectedEngines: [],
      knownEngines: [],
    });
    expect(
      screen.getByText(
        "Hanger looks in your home directory for the folders coding agents keep there, and found none. Run one once, then rescan."
      )
    ).toBeTruthy();
  });

  it("a category emptied by a filter says so; a category with nothing says that", () => {
    // mockInventory has one global skill and one global tool. A search that
    // hides the skill is not "no skills"; and the chip says MCP servers, so
    // an empty Tools view must never say "tools".
    const { unmount } = render(
      <ProfilePane
        inventory={mockInventory}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Skills"
        filterText="zzz-nothing"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByText("No skill matches that filter")).toBeTruthy();
    // A filter, not an absence — the search glyph, not the inbox.
    expect(
      screen
        .getByText("No skill matches that filter")
        .closest("div")
        ?.querySelector('path[d="m21 21-4.3-4.3"]')
    ).toBeTruthy();
    unmount();

    render(
      <ProfilePane
        inventory={{ ...mockInventory, tools: [] }}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Tools"
        // mockInventory's one agent is Claude Code, so it belongs here too —
        // Task 11 gives Tools its own, more specific absence claim (Appendix
        // A.1) once engines are known to be detected; the generic
        // "No MCP servers in the global store" line this used to assert is
        // what A.1 replaces for exactly this category.
        detectedEngines={[{ id: "claude-code", name: "Claude Code" }]}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByText("No MCP servers registered")).toBeTruthy();
    expect(
      screen.getByText("Claude Code is installed here, but no engine has a server configured.")
    ).toBeTruthy();
    expect(screen.queryByText(/No global tools/)).toBeNull();
    expect(screen.queryByText("No MCP servers in the global store")).toBeNull();
  });

  it("a re-scan is pending, not an empty claim, even though an earlier scan already finished", () => {
    // Regression: `hasScanned` alone gated the absence claim. The store's
    // own state (inventory, assetCounts) does not reset when Rescan is
    // clicked -- it only changes on scan://complete -- so if the store was
    // already empty before this rescan, `loading` going true is the only
    // signal that distinguishes "still empty" from "don't know yet, a fresh
    // answer is coming". Without consulting it, the plane keeps asserting
    // "nothing here" for the whole rescan.
    renderGlobal({
      loading: true,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
    expect(screen.queryByText("Nothing in the global store yet")).toBeNull();
    // Same disc, same loop rule — a re-scan is scanning too, not a fresh
    // mark of its own.
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M6 12c0-1.7.7-3.2 1.8-4.2"]')
    ).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeTruthy();
  });

  it("filtering to a category with nothing in it, mid-scan, is pending -- not an absence claim", () => {
    // storeEmpty is false here (skills and rules are present), so the
    // whole-store planes never fire; the category branch is what has to
    // answer for a filtered, empty Tools view while a rescan is running.
    renderGlobal({
      inventory: { ...mockInventory, tools: [] },
      loading: true,
      scannedAt: new Date(),
      selectedCategory: "Tools",
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.getByText("MCP servers show up here once the scan finishes.")).toBeTruthy();
    expect(screen.queryByText("No MCP servers in the global store")).toBeNull();
    // Category-scoped pending is always scanning (ruling 12) — same disc,
    // same loop.
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M6 12c0-1.7.7-3.2 1.8-4.2"]')
    ).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeTruthy();
  });

  it("filtering to a category with nothing in it, scan finished, correctly claims the absence", () => {
    // Fix round 1, ruling item 5: this test and "a category emptied by a
    // filter says so..." above were BOTH repointed at Tools when Task 11
    // landed, which left the shared generic branch ("No {noun} in the
    // global store" / "The scan finished without finding any.") — still
    // live for Skills, Rules and Subagents — exercised by nothing at all;
    // mutating either string stayed green. Redirected to Skills so the
    // generic branch keeps a pin; Tools' own A.1 shape is already covered
    // in full by "a category emptied by a filter..." above and by the
    // "Tools' own empty states" describe block below.
    renderGlobal({
      inventory: { ...mockInventory, skills: [] },
      loading: false,
      scannedAt: new Date(),
      selectedCategory: "Skills",
    });
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("No skills in the global store")).toBeTruthy();
    expect(screen.getByText("The scan finished without finding any.")).toBeTruthy();
    // Genuinely empty, no filter involved, no MCP appendix — the inbox mark.
    expect(
      screen
        .getByText("No skills in the global store")
        .closest("div")
        ?.querySelector('polyline[points="22 12 16 12 14 15 10 15 8 12 2 12"]')
    ).toBeTruthy();
  });

  // One of everything, at Global scope, so emptying a single category for
  // the loop below never makes the WHOLE store look empty and trip the
  // planes this suite already covers above.
  const oneOfEveryCategory: Inventory = {
    agents: [{ id: "a1", name: "Claude Code", global_config_path: "/home/user/.claude", project_footprints: [] }],
    skills: [{ id: "s1", name: "S", description: "", version: "1.0.0", path: "/s", scope: { Global: { agent: "a1" } } }],
    tools: [{ id: "t1", name: "T", command: "x", transport: "stdio", config_path: "/t", scope: { Global: { agent: "a1" } }, owning_agent: "a1" }],
    rules: [{ id: "r1", name: "R", path: "/r", content: "x", scope: { Global: { agent: "a1" } } }],
    subagents: [{ id: "sa1", name: "SA", description: "", path: "/sa", declared_tools: [], scope: { Global: { agent: "a1" } } }],
    project_scans: [],
  };

  it.each([
    ["Skills", "skills"],
    ["Tools", "MCP servers"],
    ["Rules", "rules"],
    ["Subagents", "subagents"],
    ["Agents", "agents"],
  ] as const)("category %s gets its own pending state mid-scan, named with its own noun", (category, noun) => {
    const emptiedField =
      category === "Skills" ? "skills" :
      category === "Tools" ? "tools" :
      category === "Rules" ? "rules" :
      category === "Subagents" ? "subagents" : "agents";
    renderGlobal({
      inventory: { ...oneOfEveryCategory, [emptiedField]: [] },
      loading: true,
      scannedAt: new Date(),
      selectedCategory: category,
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.getByText(`${noun} show up here once the scan finishes.`)).toBeTruthy();
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M6 12c0-1.7.7-3.2 1.8-4.2"]')
    ).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeTruthy();
  });
});

describe("ProfilePane — T4: counts without rows is pending, not a blank table", () => {
  // The backend serves `assetCounts` from SQLite instantly on start;
  // `inventory` only lands on scan://complete. In that window `storeEmpty`
  // read `assetCounts` first and never consulted `inventory` at all, so a
  // global store with counts persisted from an earlier scan rendered
  // `AssetHeaderRow`'s column labels over zero rows — "Showing 0 of 144"
  // under a blank table. Karthik saw this live, twice, 2026-08-25.

  it("counts have arrived (144, non-zero) but inventory has not: the scanning plane renders, not a blank table", () => {
    render(
      <ProfilePane
        inventory={null}
        assetCounts={{
          total: 144,
          byCategory: {
            skill: { total: 100, global: 100, project: 0 },
            tool: { total: 30, global: 30, project: 0 },
            rule: { total: 10, global: 10, project: 0 },
            subagent: { total: 4, global: 4, project: 0 },
          },
        }}
        loading={true}
        scannedAt={null}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    // The scanning disc, looping — same mark the other pending tests pin.
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M6 12c0-1.7.7-3.2 1.8-4.2"]')
    ).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeTruthy();
    // Never both on screen together — the bug this pins is precisely a
    // header rendering while nothing backs it.
    expect(screen.queryByTestId("asset-list-scroll")).toBeNull();
  });

  it("emptyState did not regress: a genuinely empty, finished, idle store still claims the finding", () => {
    render(
      <ProfilePane
        inventory={{ agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] }}
        assetCounts={{ total: 0, byCategory: {} }}
        loading={false}
        scannedAt={new Date()}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("No engine folders on this machine yet")).toBeTruthy();
  });

  it("pending does not cover real content: counts and rows have both arrived, the table renders even mid-rescan", () => {
    // The over-broad-guard case: `nothingToShow` must not stay true just
    // because a scan is running and counts exist — real rows already in
    // `inventory` have to suppress the pending plane, same as a re-scan of
    // an already-populated store should never blank the screen.
    render(
      <ProfilePane
        inventory={mockInventory}
        assetCounts={{
          total: 3,
          byCategory: {
            skill: { total: 1, global: 1, project: 0 },
            tool: { total: 1, global: 1, project: 0 },
            rule: { total: 1, global: 1, project: 0 },
          },
        }}
        loading={true}
        scannedAt={new Date()}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByTestId("asset-list-scroll")).toBeTruthy();
    expect(screen.getByText("Claude Math Skill")).toBeTruthy();
    expect(screen.getByText("Node Runner Tool")).toBeTruthy();
    expect(screen.getByText("CLAUDE.md")).toBeTruthy();
  });

  it("Appendix A's config-problem rows have already arrived: the pending plane does not cover them either", () => {
    // The same race T4 is about, but through the OTHER source ProfilePane
    // can draw from while `inventory` is still null: `mcpCoverage` is its
    // own fetch, independent of the scan's `inventory`. A `nothingToShow`
    // that only checked the four scope-filtered asset arrays would still
    // blank this row out.
    render(
      <ProfilePane
        inventory={null}
        assetCounts={{
          total: 144,
          byCategory: {
            skill: { total: 100, global: 100, project: 0 },
            tool: { total: 30, global: 30, project: 0 },
            rule: { total: 10, global: 10, project: 0 },
            subagent: { total: 4, global: 4, project: 0 },
          },
        }}
        loading={true}
        scannedAt={null}
        mcpCoverage={{
          checked_file_count: 1,
          checked_engine_count: 1,
          checked_files: [],
          problems: [
            {
              kind: "Unreadable",
              path: "/home/user/.codex/config.toml",
              detail: "permission denied",
              line: null,
              engine: "Codex",
            },
          ],
        }}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByTestId("mcp-config-problem-row")).toBeTruthy();
    expect(
      screen.getByText("/home/user/.codex/config.toml — couldn't be read (permission denied)")
    ).toBeTruthy();
  });
});

describe("ProfilePane — Tools' own empty states (Appendix A.1, A.2)", () => {
  // Reachable only by filtering to Tools with zero servers and a completed
  // scan — Task 10's chip exemption is what lets the chip be clicked at all
  // when its count is zero.
  const renderTools = (over: Partial<React.ComponentProps<typeof ProfilePane>>) =>
    render(
      <ProfilePane
        inventory={{ ...mockInventory, tools: [] }}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Tools"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
        {...over}
      />
    );

  describe("A.1 — engines detected, zero MCP servers", () => {
    it("substitutes the template for three detected engines", () => {
      renderTools({
        detectedEngines: [
          { id: "claude-code", name: "Claude Code" },
          { id: "codex", name: "Codex" },
          { id: "gemini", name: "Gemini / Antigravity" },
        ],
        mcpCoverage: { checked_file_count: 5, checked_engine_count: 3, checked_files: [] },
      });
      expect(screen.getByText("No MCP servers registered")).toBeTruthy();
      expect(
        screen.getByText(
          "Claude Code, Codex and Gemini / Antigravity are installed here, but none has a server configured."
        )
      ).toBeTruthy();
      expect(screen.getByText("Checked 5 config files across 3 engines")).toBeTruthy();
      // A.1 — engines exist, nothing configured: the crossed-out bolt.
      expect(
        screen
          .getByText("No MCP servers registered")
          .closest("div")
          ?.querySelector('path[d="m2 2 20 20"]')
      ).toBeTruthy();
    });

    it("truncates past three engines to 'and n others' — never a fixed list", () => {
      renderTools({
        detectedEngines: [
          { id: "a", name: "Claude Code" },
          { id: "b", name: "Codex" },
          { id: "c", name: "Gemini / Antigravity" },
          { id: "d", name: "Cursor" },
          { id: "e", name: "Zed" },
        ],
        mcpCoverage: { checked_file_count: 9, checked_engine_count: 5, checked_files: [] },
      });
      expect(
        screen.getByText(
          "Claude Code, Codex, Gemini / Antigravity and 2 others are installed here, but none has a server configured."
        )
      ).toBeTruthy();
    });

    it("reads in the singular for exactly one detected engine: is / no engine has", () => {
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 1, checked_engine_count: 1, checked_files: [] },
      });
      expect(
        screen.getByText("Claude Code is installed here, but no engine has a server configured.")
      ).toBeTruthy();
      expect(screen.getByText("Checked 1 config file across 1 engine")).toBeTruthy();
    });

    it("reads 'neither' for exactly two detected engines", () => {
      renderTools({
        detectedEngines: [
          { id: "claude-code", name: "Claude Code" },
          { id: "codex", name: "Codex" },
        ],
        mcpCoverage: { checked_file_count: 2, checked_engine_count: 2, checked_files: [] },
      });
      expect(
        screen.getByText("Claude Code and Codex are installed here, but neither has a server configured.")
      ).toBeTruthy();
    });

    it("the file/engine counts are the backend's own fields, not a derived length", () => {
      // Same three engines as the first case, but a coverage shape a
      // frontend-computed `.length` could never produce on its own —
      // proves the numbers rendered are `mcpCoverage`'s fields.
      renderTools({
        detectedEngines: [
          { id: "claude-code", name: "Claude Code" },
          { id: "codex", name: "Codex" },
          { id: "gemini", name: "Gemini / Antigravity" },
        ],
        mcpCoverage: { checked_file_count: 41, checked_engine_count: 7, checked_files: [] },
      });
      expect(screen.getByText("Checked 41 config files across 7 engines")).toBeTruthy();
    });

    it("has no primary action — Hanger does not author configs", () => {
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 1, checked_engine_count: 1, checked_files: [] },
      });
      expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /rescan/i })).toBeNull();
    });

    it("[Show files] discloses the real paths read, one per line", () => {
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: {
          checked_file_count: 2,
          checked_engine_count: 1,
          checked_files: ["~/.claude.json", "~/.claude/mcp.json"],
        },
      });
      expect(screen.queryByText("~/.claude.json")).toBeNull();
      fireEvent.click(screen.getByText("Show files"));
      expect(screen.getByText("~/.claude.json")).toBeTruthy();
      expect(screen.getByText("~/.claude/mcp.json")).toBeTruthy();
      fireEvent.click(screen.getByText("Hide files"));
      expect(screen.queryByText("~/.claude.json")).toBeNull();
    });

    it("does not offer the disclosure when there is nothing to show", () => {
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 0, checked_engine_count: 0, checked_files: [] },
      });
      expect(screen.queryByText("Show files")).toBeNull();
    });

    describe("coverage that has not arrived, or never will", () => {
      // Fix round 1 ruling: a false "Checked 0 config files across 0
      // engines" is worse than no figure at all — the count line and its
      // disclosure render only once `mcpCoverage` actually has an answer.
      // `mcpCoverage` pending (the fetch hasn't resolved) and failed
      // (App.tsx's `catch { setMcpCoverage(null) }`) are the same prop
      // value, `null` — the component cannot tell them apart, and per the
      // ruling neither should ever assert a figure.

      it("renders no count line while the coverage fetch is still pending", () => {
        renderTools({
          detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
          // mcpCoverage omitted — the prop's own default is null, the exact
          // shape ProfilePane is in before `get_mcp_coverage` resolves.
        });
        expect(screen.getByText("No MCP servers registered")).toBeTruthy();
        expect(
          screen.getByText("Claude Code is installed here, but no engine has a server configured.")
        ).toBeTruthy();
        expect(screen.queryByText(/Checked/)).toBeNull();
        expect(screen.queryByText("Show files")).toBeNull();
        expect(screen.queryByText("Show locations")).toBeNull();
      });

      it("renders no count line, permanently, if the coverage fetch failed", () => {
        // Mechanically identical to the pending case above (both are
        // `mcpCoverage: null`) — kept as its own test because the ruling
        // names it as its own path: a failure never resolves, so this state
        // is not transient the way pending is, and the same gate has to
        // hold forever, not just until a fetch lands.
        renderTools({
          detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
          mcpCoverage: null,
        });
        expect(screen.queryByText(/Checked/)).toBeNull();
        expect(screen.queryByText(/config file/)).toBeNull();
      });
    });

    it("renders the locations form, never '0 config files', when discovery genuinely checked nothing", () => {
      // An engine can be detected (its folder exists) while none of its MCP
      // config files exist yet — a true, honest 0/0. "Checked 0 config
      // files across 0 engines" names nothing a user can go look at;
      // Appendix A.2's own vocabulary (locations, backend-counted the same
      // way) is the more honest claim for this specific shape.
      renderTools({
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 0, checked_engine_count: 0, checked_files: [] },
        knownEngineLocations: { location_count: 3, locations: ["~/.claude", "~/.claude.json", "~/.claude/mcp.json"] },
      });
      expect(screen.getByText("No MCP servers registered")).toBeTruthy();
      expect(screen.getByText("Checked 3 locations")).toBeTruthy();
      expect(screen.queryByText(/config file/)).toBeNull();
      expect(screen.queryByText("Show files")).toBeNull();
      fireEvent.click(screen.getByText("Show locations"));
      expect(screen.getByText("~/.claude")).toBeTruthy();
    });
  });

  describe("A.2 — no engines detected at all", () => {
    it("says something sane if the registry roster has not arrived yet, rather than naming an empty one", () => {
      // Mirrors the whole-store no-folders line's own guard twenty lines
      // above it (`knownEngineNames.length > 0 ? … : fallback`) — Task 11's
      // A.2 line had no equivalent, so an empty `knownEngines` rendered
      // "Hanger looks for  in their standard locations." (a double space,
      // an empty name).
      renderTools({
        detectedEngines: [],
        knownEngines: [],
        knownEngineLocations: { location_count: 0, locations: [] },
      });
      expect(screen.getByText("No AI engines found")).toBeTruthy();
      expect(screen.getByText("Hanger looks for the engines it knows about in their standard locations.")).toBeTruthy();
      expect(screen.queryByText(/for  in/)).toBeNull();
    });

    it("substitutes the registry's own roster, truncated past three", () => {
      renderTools({
        detectedEngines: [],
        knownEngines: [
          { id: "a", name: "Aardvark" },
          { id: "b", name: "Bandicoot" },
          { id: "c", name: "Capybara" },
          { id: "d", name: "Dingo" },
        ],
        knownEngineLocations: { location_count: 12, locations: [] },
      });
      expect(screen.getByText("No AI engines found")).toBeTruthy();
      expect(
        screen.getByText("Hanger looks for Aardvark, Bandicoot, Capybara and 1 other in their standard locations.")
      ).toBeTruthy();
      expect(screen.getByText("Checked 12 locations")).toBeTruthy();
      // A.2 — no engines at all: the plug reaching for a bolt that never
      // connects, not A.1's crossed-out bolt.
      expect(
        screen
          .getByText("No AI engines found")
          .closest("div")
          ?.querySelector('path[d="m18 3-4 4h6l-4 4"]')
      ).toBeTruthy();
    });

    it("reads the singular for exactly one checked location", () => {
      renderTools({
        detectedEngines: [],
        knownEngines: [{ id: "a", name: "Aardvark" }],
        knownEngineLocations: { location_count: 1, locations: [] },
      });
      expect(screen.getByText("Checked 1 location")).toBeTruthy();
    });

    it("[Show locations] discloses the real paths checked, one per line", () => {
      renderTools({
        detectedEngines: [],
        knownEngines: [{ id: "a", name: "Aardvark" }],
        knownEngineLocations: { location_count: 2, locations: ["~/.claude", "~/.codex"] },
      });
      expect(screen.queryByText("~/.claude")).toBeNull();
      fireEvent.click(screen.getByText("Show locations"));
      expect(screen.getByText("~/.claude")).toBeTruthy();
      expect(screen.getByText("~/.codex")).toBeTruthy();
    });

    it("adding a registry row changes the string with no copy edit — §6.5's exit criterion", () => {
      // The view renders whatever `knownEngines` it is given; nothing here
      // is a literal. A real registry row growing the table would flow
      // through `get_known_engines` the same way this synthetic one does.
      renderTools({
        detectedEngines: [],
        knownEngines: [
          { id: "a", name: "Aardvark" },
          { id: "b", name: "Bandicoot" },
          { id: "z", name: "Zorse" },
        ],
        knownEngineLocations: { location_count: 15, locations: [] },
      });
      expect(
        screen.getByText("Hanger looks for Aardvark, Bandicoot and Zorse in their standard locations.")
      ).toBeTruthy();
      expect(screen.getByText("Checked 15 locations")).toBeTruthy();
    });
  });

  describe("gating: pending is not empty, even for Tools' own states", () => {
    it("a rescan in flight shows the category spinner, never A.1 or A.2", () => {
      renderTools({
        loading: true,
        detectedEngines: [{ id: "claude-code", name: "Claude Code" }],
        mcpCoverage: { checked_file_count: 1, checked_engine_count: 1, checked_files: [] },
      });
      expect(screen.getByTestId("scan-pending")).toBeTruthy();
      expect(screen.getByText("Scanning your machine")).toBeTruthy();
      expect(screen.queryByText("No MCP servers registered")).toBeNull();
      expect(screen.queryByText("No AI engines found")).toBeNull();
    });

    it("before any scan has completed, neither A.1 nor A.2 renders", () => {
      render(
        <ProfilePane
          inventory={null}
          loading={false}
          scannedAt={null}
          selectedCategory="Tools"
          onSelectAsset={vi.fn()}
          onLinkAsset={vi.fn()}
          detectedEngines={[{ id: "claude-code", name: "Claude Code" }]}
        />
      );
      expect(screen.queryByText("No MCP servers registered")).toBeNull();
      expect(screen.queryByText("No AI engines found")).toBeNull();
    });
  });

  describe("reachability: Tools' own states win even when the whole store is genuinely empty", () => {
    // `emptyState && selectedCategory !== "Tools"` (ProfilePane.tsx) is what
    // this pins: every other test above uses `{...mockInventory, tools:
    // []}`, which leaves a skill and a rule behind, so `storeEmpty` is false
    // and the whole-store plane never enters the race at all. A.1's own
    // defining scenario — an engine detected, nothing configured ANYWHERE,
    // not just in Tools — and A.2's (no engine, so nothing anywhere by
    // construction) are both whole-store-empty. Reverting the exclusion to
    // plain `emptyState` leaves every other test in this file green; only a
    // genuinely empty store catches it.
    const genuinelyEmpty = {
      agents: [],
      skills: [],
      tools: [],
      rules: [],
      subagents: [],
      project_scans: [],
    };

    it("A.1 renders, not the generic whole-store line, when nothing else exists either", () => {
      render(
        <ProfilePane
          inventory={genuinelyEmpty}
          assetCounts={{ total: 0, byCategory: {} }}
          loading={false}
          scannedAt={new Date()}
          selectedCategory="Tools"
          detectedEngines={[{ id: "claude-code", name: "Claude Code" }]}
          onSelectAsset={vi.fn()}
          onLinkAsset={vi.fn()}
        />
      );
      expect(screen.getByText("No MCP servers registered")).toBeTruthy();
      expect(screen.queryByText("Nothing in the global store yet")).toBeNull();
    });

    it("A.2 renders, not the generic whole-store line, when nothing else exists either", () => {
      render(
        <ProfilePane
          inventory={genuinelyEmpty}
          assetCounts={{ total: 0, byCategory: {} }}
          loading={false}
          scannedAt={new Date()}
          selectedCategory="Tools"
          detectedEngines={[]}
          knownEngines={[{ id: "claude-code", name: "Claude Code" }]}
          onSelectAsset={vi.fn()}
          onLinkAsset={vi.fn()}
        />
      );
      expect(screen.getByText("No AI engines found")).toBeTruthy();
      expect(screen.queryByText("No engine folders on this machine yet")).toBeNull();
    });
  });
});

describe("ProfilePane — Tools' own problem rows (Appendix A.3, A.4)", () => {
  // Same reachability shape as A.1/A.2's own `renderTools` helper: filtering
  // to Tools with zero servers is what lets a problem-only Tools section
  // render at all — otherwise `isCategoryEmpty` would route to A.1/A.2
  // instead of the list these rows live in.
  const renderTools = (over: Partial<React.ComponentProps<typeof ProfilePane>>) =>
    render(
      <ProfilePane
        inventory={{ ...mockInventory, tools: [] }}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Tools"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
        {...over}
      />
    );

  it("A.3 — engine present, config format unread", () => {
    renderTools({
      mcpCoverage: {
        checked_file_count: 1,
        checked_engine_count: 1,
        checked_files: [],
        problems: [
          {
            kind: "FormatUnread",
            path: "<sanitised>/config.yaml",
            detail: "config format not yet supported",
            line: null,
            engine: "Zed",
          },
        ],
      },
    });
    expect(screen.getByText("Zed · config format not yet supported")).toBeTruthy();
  });

  it("A.4 — unreadable, naming the path and the OS error", () => {
    renderTools({
      mcpCoverage: {
        checked_file_count: 1,
        checked_engine_count: 1,
        checked_files: [],
        problems: [
          {
            kind: "Unreadable",
            path: "<sanitised>/.codex/config.toml",
            detail: "Permission denied (os error 13)",
            line: null,
            engine: "Codex",
          },
        ],
      },
    });
    expect(
      screen.getByText("<sanitised>/.codex/config.toml — couldn't be read (Permission denied (os error 13))")
    ).toBeTruthy();
  });

  it("A.4 — unparseable, naming the path and the line", () => {
    renderTools({
      mcpCoverage: {
        checked_file_count: 1,
        checked_engine_count: 1,
        checked_files: [],
        problems: [
          {
            kind: "Unparseable",
            path: "<sanitised>/.claude/mcp.json",
            detail: "expected `,` or `}` at line 4 column 3",
            line: 4,
            engine: "Claude Code",
          },
        ],
      },
    });
    expect(screen.getByText("<sanitised>/.claude/mcp.json — couldn't be parsed (line 4)")).toBeTruthy();
  });

  it("omits the parenthetical entirely when the parser supplies no line — never an empty one", () => {
    renderTools({
      mcpCoverage: {
        checked_file_count: 1,
        checked_engine_count: 1,
        checked_files: [],
        problems: [
          {
            kind: "Unparseable",
            path: "<sanitised>/.gemini/settings.json",
            detail: "unexpected end of input",
            line: null,
            engine: "Gemini / Antigravity",
          },
        ],
      },
    });
    expect(screen.getByText("<sanitised>/.gemini/settings.json — couldn't be parsed")).toBeTruthy();
    // Never "(line )" and never a bare "()" — an invented placeholder would
    // read as a real location and send someone hunting a line that isn't
    // there.
    expect(screen.queryByText(/couldn't be parsed \(line\)/)).toBeNull();
    expect(screen.queryByText(/couldn't be parsed \(\)/)).toBeNull();
    expect(screen.queryByText(/couldn't be parsed \(line \)/)).toBeNull();
  });

  it("never collapses Unreadable and Unparseable to the same line, even for the same path", () => {
    renderTools({
      mcpCoverage: {
        checked_file_count: 2,
        checked_engine_count: 2,
        checked_files: [],
        problems: [
          {
            kind: "Unreadable",
            path: "<sanitised>/shared.json",
            detail: "Permission denied (os error 13)",
            line: null,
            engine: "Codex",
          },
          {
            kind: "Unparseable",
            path: "<sanitised>/shared.json",
            detail: "unexpected token",
            line: 2,
            engine: "Codex",
          },
        ],
      },
    });
    expect(
      screen.getByText("<sanitised>/shared.json — couldn't be read (Permission denied (os error 13))")
    ).toBeTruthy();
    expect(screen.getByText("<sanitised>/shared.json — couldn't be parsed (line 2)")).toBeTruthy();
  });

  it("a rescan in flight keeps showing the last known problems, never clearing them mid-scan", () => {
    // Mirrors how the server list itself behaves during a rescan: `loading`
    // never resets `mcpCoverage` to empty, so the last fetched answer stays
    // on screen until scan://complete lands a fresh one — the same "pending
    // is not empty" rule this file already pins for A.1/A.2 and the asset
    // rows, applied to problem rows too.
    renderTools({
      loading: true,
      mcpCoverage: {
        checked_file_count: 1,
        checked_engine_count: 1,
        checked_files: [],
        problems: [
          {
            kind: "FormatUnread",
            path: "<sanitised>/config.yaml",
            detail: "config format not yet supported",
            line: null,
            engine: "Zed",
          },
        ],
      },
    });
    expect(screen.getByText("Zed · config format not yet supported")).toBeTruthy();
  });

  it("does not render a kind Appendix A has no row copy for here (DeclaredNothing)", () => {
    // A DeclaredNothing-only `problems` array would route to A.1/A.2
    // instead of the list (no row kind this task renders, so
    // `configProblemRows` would be empty either way) — that would prove
    // nothing about filtering. Pairing it with a real FormatUnread problem
    // forces the list branch open, so this test actually exercises the
    // filter: exactly one row renders, never two, and never the
    // DeclaredNothing text.
    renderTools({
      mcpCoverage: {
        checked_file_count: 2,
        checked_engine_count: 2,
        checked_files: [],
        problems: [
          {
            kind: "DeclaredNothing",
            path: "<sanitised>/mcp.json",
            detail: "declares no MCP servers, though this file exists solely to declare them",
            line: null,
            engine: "Claude Code",
          },
          {
            kind: "FormatUnread",
            path: "<sanitised>/config.yaml",
            detail: "config format not yet supported",
            line: null,
            engine: "Zed",
          },
        ],
      },
    });
    expect(screen.queryAllByTestId("mcp-config-problem-row")).toHaveLength(1);
    expect(screen.getByText("Zed · config format not yet supported")).toBeTruthy();
    expect(screen.queryByText(/declares no MCP servers/)).toBeNull();
  });
});

describe("ProfilePane — the All tab's own filter-empty state", () => {
  // `isCategoryEmpty` is a disjunction over `selectedCategory === "<literal>"`
  // — on All, `selectedCategory` is null, so every arm was false and a
  // non-matching filter fell through to the table, printing
  // `AssetHeaderRow`'s column labels over zero rows (Karthik hit this typing
  // "zzzz" with All selected). This is a search-results empty state, so it
  // must fire ONLY for an active query on a scanned, non-empty store — never
  // as a stand-in for the whole-store pending/empty planes above it.

  it("says so when a filter on All matches nothing, after a scan", () => {
    render(
      <ProfilePane
        inventory={mockInventory}
        loading={false}
        scannedAt={new Date()}
        filterText="zzzz"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByText("No assets match that filter")).toBeTruthy();
    // Never the table it replaces: no header labels, no row for the
    // filtered-out fixture assets.
    expect(screen.queryByText("Claude Math Skill")).toBeNull();
    expect(screen.queryByText("Node Runner Tool")).toBeNull();
    expect(screen.queryByText("CLAUDE.md")).toBeNull();
    expect(screen.queryByTestId("asset-list-scroll")).toBeNull();
    // A filter, not an absence — the search glyph, same mark the
    // per-category filter-empty state uses.
    expect(
      screen
        .getByText("No assets match that filter")
        .closest("div")
        ?.querySelector('path[d="m21 21-4.3-4.3"]')
    ).toBeTruthy();
  });

  it("does not appear with an empty filter box — the whole-store empty plane wins instead", () => {
    render(
      <ProfilePane
        inventory={{ agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] }}
        assetCounts={{ total: 0, byCategory: {} }}
        loading={false}
        scannedAt={new Date()}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByText("No engine folders on this machine yet")).toBeTruthy();
    expect(screen.queryByText("No assets match that filter")).toBeNull();
  });

  it("does not appear while a scan is running — the scanning plane wins instead", () => {
    render(
      <ProfilePane
        inventory={mockInventory}
        loading={true}
        scannedAt={new Date()}
        filterText="zzzz"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.queryByText("No assets match that filter")).toBeNull();
  });

  it("does not appear before a first scan has completed", () => {
    render(
      <ProfilePane
        inventory={null}
        loading={false}
        scannedAt={null}
        filterText="zzzz"
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
      />
    );
    // The strip carries its own "Not scanned yet" stamp too — scoped to the
    // pending plane itself, same as the whole-store pending test above.
    expect(within(screen.getByTestId("scan-pending")).getByText("Not scanned yet")).toBeTruthy();
    expect(screen.queryByText("No assets match that filter")).toBeNull();
  });
});
