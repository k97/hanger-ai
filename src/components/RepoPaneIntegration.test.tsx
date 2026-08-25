// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import RepoPane from "./RepoPane";
import { Inventory } from "../App";

afterEach(() => {
  cleanup();
});

const mockInventory: Inventory = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "Project Skill",
      description: "local skill",
      version: "1.0.0",
      path: "/home/user/project/skills/local-skill",
      source_origin: "origin",
      scope: { Project: { agent: "unknown", root: "/home/user/project" } },
      source_path: "/home/user/.claude/skills/local-skill", // Has provenance!
      is_symlink: true,
    },
    {
      id: "skill-2",
      name: "Native Skill",
      description: "native local skill",
      version: "1.0.0",
      path: "/home/user/project/skills/native-skill",
      scope: { Project: { agent: "unknown", root: "/home/user/project" } },
      is_symlink: false,
      // No provenance (native)
    }
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};

describe("RepoPane Linking Gestures Integration", () => {
  it("should render unlink button only for rows with resolved provenance", () => {
    const handleSelectAsset = vi.fn();
    const handleRefresh = vi.fn();
    const handleLinkFromProfile = vi.fn();

    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        onRefresh={handleRefresh}
        onSelectAsset={handleSelectAsset}
        onLinkFromProfile={handleLinkFromProfile}
      />
    );

    expect(screen.getByText("Project Skill")).toBeTruthy();
    expect(screen.getByText("Native Skill")).toBeTruthy();
    expect(screen.getByText("Symlinked")).toBeTruthy();
    expect(screen.getByText("Local only")).toBeTruthy();
  });

  it("should trigger onLinkFromProfile when empty-repo CTA button is clicked", () => {
    const handleSelectAsset = vi.fn();
    const handleRefresh = vi.fn();
    const handleLinkFromProfile = vi.fn();

    const emptyInventory: Inventory = {
      agents: [],
      skills: [],
      tools: [],
      rules: [],
      subagents: [],
      project_scans: [],
    };

    render(
      <RepoPane
        repoPath="/home/user/empty-project"
        inventory={emptyInventory}
        loading={false}
        scannedAt={new Date()}
        onRefresh={handleRefresh}
        onSelectAsset={handleSelectAsset}
        onLinkFromProfile={handleLinkFromProfile}
      />
    );

    // Empty state CTA should be visible
    const ctaButton = screen.getByText("Link an asset from Global");
    expect(ctaButton).toBeTruthy();

    fireEvent.click(ctaButton);
    expect(handleLinkFromProfile).toHaveBeenCalledTimes(1);
    expect(handleLinkFromProfile).toHaveBeenCalledWith("/home/user/empty-project");
  });

  it("the category track sits above the strip — the control above what it changes", () => {
    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
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
    const trackBox = track.parentElement!.parentElement!.parentElement!; // wrapper > flex-1 wrapper > section > tablist
    const stripBox = strip.parentElement!;
    // Siblings under one flex column, which is the only arrangement in which
    // an `order` utility would apply at all.
    expect(trackBox.parentElement).toBe(stripBox.parentElement);
    // Cited verbatim by DESIGN.md -> Pane composition; change them together.
    expect(trackBox.className).toBe("px-[18px] pt-3.5 pb-1.5 flex items-center gap-3");
    expect(stripBox.className).toBe("mx-[18px] mt-2.5 mb-2.5");
  });

  it("the strip follows the selected category: the repo's skill total and the skill noun", () => {
    const counts = { total: 9, byCategory: { skill: { total: 7, global: 0, project: 7 }, tool: { total: 0, global: 0, project: 0 } } };
    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        assetCounts={counts}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByText("Skills").find((el) => el.closest("[tabindex]"))!.closest("[tabindex]")!);
    const strip = screen.getByLabelText("Inventory summary");
    expect(within(strip).getByText("7")).toBeTruthy();
    expect(within(strip).getByText("skills in project · 0 engines")).toBeTruthy();
  });
});

describe("RepoPane — the empty state is a finding, not a default", () => {
  const emptyInventory: Inventory = {
    agents: [],
    skills: [],
    tools: [],
    rules: [],
    subagents: [],
    project_scans: [],
  };

  const renderRepo = (over: Partial<React.ComponentProps<typeof RepoPane>>) =>
    render(
      <RepoPane
        repoPath="/home/user/empty-project"
        inventory={emptyInventory}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
        {...over}
      />
    );

  it("makes no claim before the first scan completes", () => {
    // Seen 2026-08-16: mid-scan the pane said the repository held no assets
    // while the sidebar was already counting 82 for it.
    renderRepo({ loading: true, scannedAt: null });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.getByText("Assets in empty-project show up here once the scan finishes.")).toBeTruthy();
    expect(screen.queryByText("Nothing in empty-project yet")).toBeNull();
    expect(screen.queryByText("Link an asset from Global")).toBeNull();
    // Scanning: the folder holds, the sync arrows turn — the loop rule is
    // what tells it apart from the idle folder-clock below.
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M12 10v4h4"]')
    ).toBeTruthy();
    const pendingLoop = screen.getByTestId("scan-pending").querySelector("g.aim-loop");
    expect(pendingLoop).toBeTruthy();
    // The arrows sit bottom-right on this glyph and rotate about (17,16),
    // not the 24-grid centre — invisible at 0/360deg, so a regression here
    // is silent unless the origin itself is pinned.
    expect(pendingLoop!.getAttribute("style")).toMatch(/--ox:\s*17px/);
    expect(pendingLoop!.getAttribute("style")).toMatch(/--oy:\s*16px/);
  });

  it("with no scan running and none finished, says so rather than 'nothing here'", () => {
    renderRepo({ loading: false, scannedAt: null });
    // The strip's stamp says the same words; the claim under test is the plane's.
    expect(within(screen.getByTestId("scan-pending")).getByText("Not scanned yet")).toBeTruthy();
    expect(screen.getByText("Rescan when you're ready.")).toBeTruthy();
    expect(screen.queryByText("Nothing in empty-project yet")).toBeNull();
    // Idle: the folder-clock's hands sweep once and hold — never looping, so
    // a stopped scan never reads as a frozen spinner.
    expect(screen.getByTestId("scan-pending").querySelector('path[d="M16 14v2l1 1"]')).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeNull();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-once")).toBeTruthy();
  });

  it("claims the repository is empty only after a completed scan finds nothing", () => {
    renderRepo({ loading: false, scannedAt: new Date(), assetCounts: { total: 0, byCategory: {} } });
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("Nothing in empty-project yet")).toBeTruthy();
    expect(screen.getByText("Link an asset from Global")).toBeTruthy();
    // Genuinely empty, no repository to sync yet — the folder-plus mark,
    // played once.
    expect(
      screen.getByText("Nothing in empty-project yet").closest("div")?.querySelector('path[d="M12 10v6"]')
    ).toBeTruthy();
    // aim-once sits on the animating element itself, not a wrapping <g> —
    // folder-plus is one of the ten stagger marks (finding 1, final review).
    expect(
      screen.getByText("Nothing in empty-project yet").closest("div")?.querySelector(".aim-once")
    ).toBeTruthy();
  });

  it("a category emptied by a filter says so; a category with nothing says that", () => {
    // Skills exist in this repo, so "no skills here" would be false when a
    // search is what hid them. The chip says MCP servers, so the copy must
    // never say "tools".
    const { unmount } = render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Skills"
        filterText="zzz-nothing"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.getByText("No skill matches that filter")).toBeTruthy();
    // A filter, not an absence — the search glyph, entering once.
    expect(
      screen.getByText("No skill matches that filter").closest("div")?.querySelector('path[d="m21 21-4.3-4.3"]')
    ).toBeTruthy();
    expect(
      screen.getByText("No skill matches that filter").closest("div")?.querySelector("g.aim-once")
    ).toBeTruthy();
    unmount();

    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        scannedAt={new Date()}
        selectedCategory="Tools"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.getByText("No MCP servers in project")).toBeTruthy();
    expect(screen.queryByText(/tools/i)).toBeNull();
  });

  it("a re-scan is pending, not an empty claim, even though an earlier scan already finished", () => {
    // Same regression as ProfilePane: the repo's own state does not reset
    // when Rescan is clicked, only on completion -- `loading` is what tells
    // "still empty" apart from "don't know yet".
    renderRepo({
      loading: true,
      scannedAt: new Date(),
      assetCounts: { total: 0, byCategory: {} },
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine")).toBeTruthy();
    expect(screen.queryByText("Nothing in empty-project yet")).toBeNull();
    expect(screen.queryByText("Link an asset from Global")).toBeNull();
    // Same re-scan, same sync mark, same loop rule.
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M12 10v4h4"]')
    ).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeTruthy();
  });

  it("filtering to a category with nothing in it, mid-scan, is pending -- not an absence claim", () => {
    // storeEmpty is false here (mockInventory's skills are present), so the
    // whole-repo planes never fire.
    renderRepo({
      repoPath: "/home/user/project",
      inventory: { ...mockInventory, tools: [] },
      loading: true,
      scannedAt: new Date(),
      selectedCategory: "Tools",
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning this repository")).toBeTruthy();
    expect(screen.getByText("MCP servers show up here once the scan finishes.")).toBeTruthy();
    expect(screen.queryByText("No MCP servers in project")).toBeNull();
    // Category-scoped pending is always scanning (same as the whole-repo
    // plane above) — same sync mark, same loop.
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M12 10v4h4"]')
    ).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeTruthy();
  });

  it("filtering to a category with nothing in it, scan finished, correctly claims the absence", () => {
    renderRepo({
      repoPath: "/home/user/project",
      inventory: { ...mockInventory, tools: [] },
      loading: false,
      scannedAt: new Date(),
      selectedCategory: "Tools",
    });
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    expect(screen.getByText("No MCP servers in project")).toBeTruthy();
    expect(screen.getByText("The scan finished without finding any.")).toBeTruthy();
    // Genuinely empty, no filter involved — the inbox mark, entering once.
    expect(
      screen
        .getByText("No MCP servers in project")
        .closest("div")
        ?.querySelector('polyline[points="22 12 16 12 14 15 10 15 8 12 2 12"]')
    ).toBeTruthy();
    // aim-once sits on the animating element itself, not a wrapping <g> —
    // inbox is one of the ten stagger marks (finding 1, final review).
    expect(
      screen.getByText("No MCP servers in project").closest("div")?.querySelector(".aim-once")
    ).toBeTruthy();
  });

  // One of everything, scoped to this repository, so emptying a single
  // category for the loop below never makes the WHOLE repo look empty.
  const oneOfEveryCategoryHere: Inventory = {
    agents: [{ id: "a1", name: "Claude Code", global_config_path: "/x", project_footprints: ["/home/user/project"] }],
    skills: [{ id: "s1", name: "S", description: "", version: "1.0.0", path: "/home/user/project/s", scope: { Project: { agent: "a1", root: "/home/user/project" } } }],
    tools: [{ id: "t1", name: "T", command: "x", transport: "stdio", config_path: "/home/user/project/t", scope: { Project: { agent: "a1", root: "/home/user/project" } }, owning_agent: "a1" }],
    rules: [{ id: "r1", name: "R", path: "/home/user/project/r", content: "x", scope: { Project: { agent: "a1", root: "/home/user/project" } } }],
    subagents: [{ id: "sa1", name: "SA", description: "", path: "/home/user/project/sa", declared_tools: [], scope: { Project: { agent: "a1", root: "/home/user/project" } } }],
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
    renderRepo({
      repoPath: "/home/user/project",
      inventory: { ...oneOfEveryCategoryHere, [emptiedField]: [] },
      loading: true,
      scannedAt: new Date(),
      selectedCategory: category,
    });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning this repository")).toBeTruthy();
    expect(screen.getByText(`${noun} show up here once the scan finishes.`)).toBeTruthy();
    expect(
      screen.getByTestId("scan-pending").querySelector('path[d="M12 10v4h4"]')
    ).toBeTruthy();
    expect(screen.getByTestId("scan-pending").querySelector("g.aim-loop")).toBeTruthy();
  });
});

describe("RepoPane — the All tab's own filter-empty state", () => {
  // Same bug class as ProfilePane's: `isCategoryEmpty` is a disjunction over
  // `selectedCategory === "<literal>"`, so on All (`selectedCategory` null)
  // every arm was false and a non-matching filter fell through to the table.
  // A search-results empty state, so it must fire ONLY for an active query
  // on a scanned, non-empty repo — never as a stand-in for the whole-repo
  // pending/empty planes above it.

  it("says so when a filter on All matches nothing, after a scan", () => {
    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        scannedAt={new Date()}
        filterText="zzzz"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.getByText("No assets match that filter")).toBeTruthy();
    // Never the table it replaces: no row for the filtered-out fixture assets.
    expect(screen.queryByText("Project Skill")).toBeNull();
    expect(screen.queryByText("Native Skill")).toBeNull();
    // A filter, not an absence — the search glyph, same mark the
    // per-category filter-empty state uses.
    expect(
      screen
        .getByText("No assets match that filter")
        .closest("div")
        ?.querySelector('path[d="m21 21-4.3-4.3"]')
    ).toBeTruthy();
  });

  it("does not appear with an empty filter box — the whole-repo empty plane wins instead", () => {
    render(
      <RepoPane
        repoPath="/home/user/empty-project"
        inventory={{ agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] }}
        assetCounts={{ total: 0, byCategory: {} }}
        loading={false}
        scannedAt={new Date()}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.getByText("Nothing in empty-project yet")).toBeTruthy();
    expect(screen.queryByText("No assets match that filter")).toBeNull();
  });

  it("does not appear while a scan is running — the scanning plane wins instead", () => {
    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={true}
        scannedAt={new Date()}
        filterText="zzzz"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning this repository")).toBeTruthy();
    expect(screen.queryByText("No assets match that filter")).toBeNull();
  });

  it("does not appear before a first scan has completed", () => {
    render(
      <RepoPane
        repoPath="/home/user/empty-project"
        inventory={{ agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] }}
        loading={false}
        scannedAt={null}
        filterText="zzzz"
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    // The strip carries its own "Not scanned yet" stamp too — scoped to the
    // pending plane itself, same as the whole-repo pending test above.
    expect(within(screen.getByTestId("scan-pending")).getByText("Not scanned yet")).toBeTruthy();
    expect(screen.queryByText("No assets match that filter")).toBeNull();
  });
});
