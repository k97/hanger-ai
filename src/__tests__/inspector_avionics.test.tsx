// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import App from "../App";
import { invoke } from "@tauri-apps/api/core";

const mockPreferences: Record<string, string> = {
  onboarding_complete: "true",
  consent_crash: "true",
  consent_usage: "true",
  sidebar_collapsed: "false",
  sidebar_width: "240",
  selected_sidebar_item: "~/Work/demo",
  inspector_open: "false",
  inspector_width: "280",
};

const mockInventoryData = {
  agents: [],
  skills: [
    {
      id: "skill-1",
      name: "Inspector Skill One",
      description: "Sample skill for inspector test",
      version: "1.2.0",
      path: "~/Work/demo/skills/inspector-skill-1",
      source_origin: "~/Source/skills/inspector-skill-1",
      is_symlink: true,
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
    },
    // For test 13 only: a broken link gives the cap a finding to route from.
    {
      id: "skill-2",
      name: "Broken Skill",
      description: "Sample skill with a broken link, for the cap's review route",
      version: "1.0.0",
      path: "~/Work/demo/skills/broken-skill",
      source_origin: "~/Source/skills/broken-skill",
      is_symlink: true,
      link_state: "broken",
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
    },
  ],
  tools: [
    {
      id: "tool-1",
      name: "Inspector Tool One",
      command: "node",
      transport: "stdio",
      config_path: "~/Work/demo/tools/inspector-tool-1.json",
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
      owning_agent: "claude",
    },
  ],
  rules: [
    {
      id: "rule-1",
      name: "Inspector Rule One",
      path: "~/Work/demo/CLAUDE.md",
      content: "Always write tests first",
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
    },
  ],
  subagents: [
    {
      id: "subagent-1",
      name: "Inspector Subagent One",
      description: "Sample subagent for inspector test",
      path: "~/Work/demo/subagents/inspector-subagent-1",
      declared_tools: [],
      scope: { Project: { agent: "claude", root: "~/Work/demo" } },
    },
  ],
  project_scans: [
    {
      path: "~/Work/demo",
      layered: false,
      rule_chains: {},
      parse_warnings: [],
    },
  ],
};

const countsObj = { total: 1, global: 1, project: 0 };
const mockAssetCounts = {
  total_assets: 3,
  total: 3,
  skill: countsObj,
  tool: countsObj,
  rule: countsObj,
  subagent: { total: 0, global: 0, project: 0 },
  byCategory: {
    skill: countsObj,
    tool: countsObj,
    rule: countsObj,
    subagent: { total: 0, global: 0, project: 0 },
  },
  engines: {},
};

let eventListeners: Record<string, (evt: any) => void> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") {
      return mockPreferences[args?.key] ?? null;
    }
    if (cmd === "set_preference") {
      if (args?.key) {
        mockPreferences[args.key] = String(args.value);
      }
      return null;
    }
    if (cmd === "get_linked_directories") return ["~/Work/demo"];
    if (cmd === "get_asset_counts") return mockAssetCounts;
    if (cmd === "get_inventory") return mockInventoryData;
    if (cmd === "start_scan") {
      if (eventListeners["scan://complete"]) {
        eventListeners["scan://complete"]({ payload: { inventory: mockInventoryData } });
      }
      return "scan-123";
    }
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, callback: any) => {
    eventListeners[event] = callback;
    return Promise.resolve(() => {
      delete eventListeners[event];
    });
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  attachConsole: vi.fn(() => Promise.resolve(() => {})),
}));

describe("Avionics A5 — Docked Right Inspector Integration", () => {
  beforeEach(() => {
    cleanup();
    eventListeners = {};
    mockPreferences.selected_sidebar_item = "~/Work/demo";
    mockPreferences.inspector_open = "false";
    mockPreferences.inspector_width = "280";
  });

  const setupMockInvoke = (inspectorOpenPref = "false", inspectorWidthPref = "280") => {
    mockPreferences.inspector_open = inspectorOpenPref;
    mockPreferences.inspector_width = inspectorWidthPref;
  };

  it("1. Toggle opens and closes the inspector", async () => {
    setupMockInvoke("false");
    render(<App />);

    await screen.findByText("Inspector Skill One");

    // Closed initially
    expect(screen.queryByText("Nothing selected")).toBeNull();

    // Click inspector toggle in header toolbar
    fireEvent.click(screen.getByLabelText("Toggle inspector"));

    // Inspector is now open and renders empty state (since no row selected yet)
    await screen.findByText("Nothing selected");

    // Open, the same toggle docks in the inspector's own cap instead of the
    // toolbar — a fresh query, not the toolbar button's now-unmounted node.
    fireEvent.click(screen.getByLabelText("Toggle inspector"));

    await waitFor(() => {
      expect(screen.queryByText("Nothing selected")).toBeNull();
    });
  });

  it("2. Open state persists across a simulated restart", async () => {
    setupMockInvoke("true", "300");
    render(<App />);

    // Inspector should be open immediately upon restart render
    await screen.findByText("Nothing selected");
  });

  it("3. Selecting a row with the inspector closed opens it straight away on that asset", async () => {
    setupMockInvoke("false");
    render(<App />);

    const skillRow = await screen.findByText("Inspector Skill One");

    // Click an asset row — tapping a row means "inspect this"
    fireEvent.click(skillRow);

    // Inspector opens immediately, showing the tapped asset (not the empty
    // state). The path now renders in Details › Identity's row title, not
    // as plain text on Content.
    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));
    await screen.findByTitle("~/Work/demo/skills/inspector-skill-1");
    expect(screen.queryByText("Nothing selected")).toBeNull();

    // The open state persists like the toolbar toggle does
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "inspector_open",
        value: "true",
      });
    });
  });

  it("4. With a row selected and the inspector open, the asset's full path string renders — asserts path text itself", async () => {
    setupMockInvoke("true");
    render(<App />);

    const skillRow = await screen.findByText("Inspector Skill One");

    // Select the skill row by clicking its row container div
    const rowContainer = skillRow.closest("div") || skillRow;
    fireEvent.click(rowContainer);

    // Assert the full path string renders — behind Details now that the
    // path lives in Identity's row title, not the always-visible Content tab.
    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));
    await waitFor(() => {
      expect(screen.getByTitle("~/Work/demo/skills/inspector-skill-1")).toBeDefined();
    });
  });

  it("5. Inspector open with no selection renders an empty state", async () => {
    setupMockInvoke("true");
    render(<App />);

    const headline = await screen.findByText("Nothing selected");
    await screen.findByText("Pick an asset or a repository to see its details.");

    // The cursor-click mark, played once: the cursor body sits outside the
    // moving group and never moves, so it is pinned separately from the
    // spark lines' burst group and its off-centre origin.
    const emptyState = headline.closest("div")!;
    expect(emptyState.querySelector('path[d^="M9.037"]')).toBeTruthy();
    const burst = emptyState.querySelector("g.aim-once");
    expect(burst).toBeTruthy();
    expect(burst!.getAttribute("style")).toMatch(/--ox:\s*9\.3px/);
  });

  it("6. Content pane and inspector coexist; both render simultaneously", async () => {
    setupMockInvoke("true");
    render(<App />);

    // Content pane renders asset rows
    await screen.findByText("Inspector Skill One");
    await screen.findByText("Inspector Tool One");
    // Inspector pane renders simultaneously alongside content pane
    await screen.findByText("Nothing selected");
  });

  it("7. Selecting a row sets the inspector to THAT asset — assert the asset's own path string renders, not merely that a path renders", async () => {
    setupMockInvoke("true");
    render(<App />);

    const toolRow = await screen.findByText("Inspector Tool One");
    fireEvent.click(toolRow);

    // The config path lives behind Details now that the MCP panel opens on
    // Tools first (M1) -- open it before asserting on the path string. A
    // Tool's detail view is McpServerDetail, not AssetDetail (Flyout routes
    // "Tools" to its own panel) -- its config path is plain text, not an
    // Identity row title, so this stays getByText rather than getByTitle.
    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));

    await waitFor(() => {
      expect(screen.getByText("~/Work/demo/tools/inspector-tool-1.json")).toBeDefined();
      expect(screen.queryByText("~/Work/demo/skills/inspector-skill-1")).toBeNull();
    });
  });

  it("8. Changing scope with the inspector open clears the selection. The inspector shows its empty state, not the previous scope's asset", async () => {
    setupMockInvoke("true");
    render(<App />);

    // Select an asset in project scope
    const skillRow = await screen.findByText("Inspector Skill One");
    fireEvent.click(skillRow);

    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));
    await screen.findByTitle("~/Work/demo/skills/inspector-skill-1");

    // Change scope to the Global store in the sidebar. "Global" also renders
    // in the inspector cap's eyebrow, so scope the query to the sidebar
    // landmark.
    const profileSidebarBtn = within(screen.getByTestId("sidebar")).getByText("Global");
    fireEvent.click(profileSidebarBtn);

    // Inspector MUST clear selection and return to empty state
    await waitFor(() => {
      expect(screen.queryByTitle("~/Work/demo/skills/inspector-skill-1")).toBeNull();
      expect(screen.getByText("Nothing selected")).toBeDefined();
    });
  });

  /* Reversed on Karthik's ruling, 2026-08-27: this item used to require the
     opposite — that changing the category filter CLEARED the selection — and
     he hit the result in the running app, a panel that went blank on a click
     that was about the list and not about what he was reading. Filtering the
     table is not choosing a new subject; the inspector holds what it has
     until another row is chosen. Item 8 above is untouched: a change of
     SCOPE is a change of subject and still clears.

     What the old assertion documented about the empty body (Task 15 f6d108f,
     fix round 1 item 5 94f6cb3 — a repo pane keeps "Nothing selected" rather
     than the machine-wide McpEngineSummary) is not lost, only unreachable
     from here now that nothing empties: `FlyoutEmptyHeader.test.tsx` covers
     that body directly. */
  it("9. Changing category filter with the inspector open holds the selection", async () => {
    setupMockInvoke("true");
    render(<App />);

    // Select an asset
    const skillRow = await screen.findByText("Inspector Skill One");
    fireEvent.click(skillRow);

    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));
    await screen.findByTitle("~/Work/demo/skills/inspector-skill-1");

    // Filter by Tools category
    const toolsFilter = screen.getByText("MCP servers");
    fireEvent.click(toolsFilter);

    // The skill is still the subject: its path row is still on screen, and
    // the panel has not fallen back to its empty state.
    await waitFor(() => {
      expect(screen.getByTitle("~/Work/demo/skills/inspector-skill-1")).toBeDefined();
    });
    expect(screen.queryByText("Nothing selected")).toBeNull();
  });

  it("10. Row highlight and inspector content always reference the same asset", async () => {
    setupMockInvoke("true");
    render(<App />);

    const toolRow = await screen.findByText("Inspector Tool One");
    const skillRow = await screen.findByText("Inspector Skill One");

    const toolContainer = toolRow.closest("div[data-selected]") || toolRow.closest("div")!;
    const skillContainer = skillRow.closest("div[data-selected]") || skillRow.closest("div")!;

    // Select tool row
    fireEvent.click(toolRow);

    // The config path below lives behind Details now that the MCP panel
    // opens on Tools first (M1). The data-selected checks in the same
    // waitFor are on rows outside the panel and are unaffected by the tab.
    // A Tool's detail view is McpServerDetail, not AssetDetail, so its path
    // stays plain text (getByText), not an Identity row title.
    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));

    await waitFor(() => {
      expect(toolContainer.getAttribute("data-selected")).toBe("true");
      expect(skillContainer.getAttribute("data-selected")).toBe("false");
      expect(screen.getByText("~/Work/demo/tools/inspector-tool-1.json")).toBeDefined();
    });

    // Select skill row. Selecting a different asset resets AssetDetail's own
    // tab state back to Content (the asset.path/kind effect), so Details is
    // clicked again before the path title is queried.
    fireEvent.click(skillRow);
    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));

    await waitFor(() => {
      expect(skillContainer.getAttribute("data-selected")).toBe("true");
      expect(toolContainer.getAttribute("data-selected")).toBe("false");
      expect(screen.getByTitle("~/Work/demo/skills/inspector-skill-1")).toBeDefined();
    });
  });

  it("11. Skill and subagent render the same inspector field set (Path, Scope, no phantom Size field)", async () => {
    setupMockInvoke("true");
    render(<App />);

    const skillRow = await screen.findByText("Inspector Skill One");
    fireEvent.click(skillRow);

    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));

    await waitFor(() => {
      expect(screen.getByTitle("~/Work/demo/skills/inspector-skill-1")).toBeDefined();
      expect(screen.queryByText(/Size:/i)).toBeNull();
      expect(screen.queryByText(/characters/i)).toBeNull();
    });
  });

  it("12. A clicked, project-scoped asset resolves its own place — not Global — in the cap eyebrow and Identity's Scope row", async () => {
    setupMockInvoke("true");
    render(<App />);

    // "Inspector Skill One" is fixtured with `scope: { Project: { agent:
    // "claude", root: "~/Work/demo" } } }` — its place is the repo's own
    // basename, "demo", never the global store.
    const skillRow = await screen.findByText("Inspector Skill One");
    fireEvent.click(skillRow);

    // The cap's eyebrow (`SKILL · <place>`) renders as soon as the row is
    // selected, without opening Details.
    await waitFor(() => {
      const eyebrow = screen.getByTestId("inspector-cap-eyebrow");
      expect(eyebrow.textContent).toContain("demo");
      expect(eyebrow.textContent).not.toContain("Global");
    });

    // Identity's own Scope row agrees it is not global. Since 2026-08-28 it
    // carries the distinction the repo name could not — Project (committed,
    // shared with the team) versus Local (private to this user) — rather than
    // repeating the basename the cap's eyebrow above has just stated. The
    // "never Global" half is the regression this case exists for and is
    // unchanged.
    fireEvent.click(await screen.findByRole("tab", { name: "Details" }));
    await waitFor(() => {
      const scopeRow = screen.getByTestId("identity-row-scope");
      expect(scopeRow.textContent).toContain("Project");
      expect(scopeRow.textContent).not.toContain("Global");
    });
  });

  it("13. The cap's review route (Decision 7) resets any standing kind/place filter, not just the issue — Needs review lands on Everything, Everywhere", async () => {
    setupMockInvoke("true");
    render(<App />);

    // Land on Needs review first and pick a filter that is not the
    // default — exactly the state a previous visit could leave behind.
    fireEvent.click(await screen.findByLabelText(/^Needs review/));

    // No issue is selected yet — ReviewInspector renders the same cursor
    // mark Flyout's own empty state wears (Flyout.tsx's comment: the two
    // inspectors share the words, and now the mark too).
    const reviewEmptyState = (await screen.findByText("Nothing selected")).closest("div")!;
    expect(reviewEmptyState.querySelector('path[d^="M9.037"]')).toBeTruthy();
    expect(reviewEmptyState.querySelector("g.aim-once")).toBeTruthy();

    const reviewSidebar = await screen.findByTestId("review-sidebar");
    fireEvent.click(within(reviewSidebar).getByRole("button", { name: /Duplicates/ }));
    fireEvent.click(within(reviewSidebar).getByRole("button", { name: /^demo/ }));
    await waitFor(() => {
      expect(
        within(reviewSidebar).getByRole("button", { name: /Duplicates/ }).getAttribute("aria-current")
      ).toBe("true");
      expect(
        within(reviewSidebar).getByRole("button", { name: /^demo/ }).getAttribute("aria-current")
      ).toBe("true");
    });

    // Back to the repository to select the broken asset the cap routes
    // from. `handleSelectSidebarItem` clears the selection on every
    // navigation, so this has to come after the filter is set, not before.
    fireEvent.click(screen.getByLabelText("My machine"));
    const sidebar = await screen.findByTestId("sidebar");
    fireEvent.click(within(sidebar).getByText("demo"));

    const brokenRow = await screen.findByText("Broken Skill");
    fireEvent.click(brokenRow);

    // Open the cap's finding chip and take its popover's route to Needs
    // review — Decision 7's path: handleSelectSidebarItem("review"),
    // setReviewKind(null), setReviewPlace(null), setSelectedIssue(issue).
    fireEvent.click(await screen.findByText("1 flagged"));
    fireEvent.click(await screen.findByText("Needs review →"));

    // Left unset, "Duplicates"/"demo" would still read active and the
    // asset's own issue (a "broken" fault, not a duplicate) would be
    // filtered straight back out of the list it was just routed to.
    await waitFor(() => {
      const sidebarAfter = screen.getByTestId("review-sidebar");
      expect(
        within(sidebarAfter).getByRole("button", { name: /^Everything/ }).getAttribute("aria-current")
      ).toBe("true");
      expect(
        within(sidebarAfter).getByRole("button", { name: /^Everywhere/ }).getAttribute("aria-current")
      ).toBe("true");
    });
  });

  // A reviewer found this unguarded by mutation: removing the
  // `!== "Subagents"` clause from `onLinkForCap` (App.tsx, near :1234) left
  // the whole 796-test suite green. `Agents` is separately protected because
  // `capAsset` excludes that category outright; nothing shielded Subagents.
  it("14. A Subagent asset gets no Link to… from the cap, on the surface or in the menu", async () => {
    setupMockInvoke("true");
    render(<App />);

    const subagentRow = await screen.findByText("Inspector Subagent One");
    fireEvent.click(subagentRow);

    // The other three menu callbacks (copy/reveal/open) are wired for any
    // selected asset regardless of category, so "More actions" itself still
    // renders — Link to… specifically, on the surface and in the menu, is
    // the thing the category exclusion is meant to withhold.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Link to…" })).toBeNull();
      expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu", { name: "More actions" });
    expect(within(menu).queryByRole("menuitem", { name: "Link to…" })).toBeNull();
  });

  // Karthik found the ⋮ "crowded and difficult to click": its trigger was
  // 21x21px, sat between two 27x27px neighbours (Expand/Collapse, Toggle
  // inspector) built from `tbBtnClass`, with only 2px of clearance. That
  // first fix gave the ⋮ the same OPTICAL size as its neighbours by scaling
  // its glyph — but `tbBtnClass`'s footprint was still content-driven
  // (`min-w-[27px] px-2`: a floor plus padding, not a fixed box), so the
  // now-larger glyph pushed the ⋮'s own button past its neighbours' width
  // (36px against their 31px) — a second, subtler proportion bug hiding
  // inside the fix for the first one. The real fix pins the footprint
  // itself — `h-[27px] w-[27px]`, no floor, no content-driven padding —
  // asserted here as the sizing half of `tbBtnClass`/`tbBtnActiveClass`,
  // not the full class string, which `tbbtn-duplicate.test.ts` already
  // owns for the App/Cap pair and would fire on a real edit to the shared
  // constant.
  it("15. The cap's icon buttons carry a fixed 27×27px footprint, not a content-driven one", async () => {
    setupMockInvoke("true");
    render(<App />);

    const subagentRow = await screen.findByText("Inspector Subagent One");
    fireEvent.click(subagentRow);

    const overflowTrigger = await screen.findByRole("button", { name: "More actions" });
    const expandTrigger = await screen.findByRole("button", { name: "Expand inspector" });
    const toggleTrigger = await screen.findByRole("button", { name: "Toggle inspector" });

    for (const [name, el] of [
      ["More actions", overflowTrigger],
      ["Expand inspector", expandTrigger],
      ["Toggle inspector", toggleTrigger],
    ] as const) {
      expect(el.className, `${name} is missing the fixed width`).toContain("w-[27px]");
      expect(el.className, `${name} is missing the fixed height`).toContain("h-[27px]");
      expect(el.className, `${name} still floors its width instead of fixing it`).not.toMatch(/\bmin-w-/);
      expect(el.className, `${name} still pads its content instead of a fixed box`).not.toMatch(/\bpx-2\b/);
    }
  });

  // The uneven gaps Karthik flagged ("disparate spacing") traced to a lone
  // `mr-2` on the ⋮'s wrapper, fighting the cluster's own `gap-*`. A snapshot
  // of the container's class string wouldn't catch a *new* stray margin
  // landing on some other control, so this instead asserts the structural
  // property the fix depends on: none of the cluster's direct children — the
  // things a single `gap` value is supposed to space — carries its own
  // horizontal margin utility.
  it("16. No control in the cap's trailing cluster carries its own horizontal margin — spacing comes from the container's gap alone", async () => {
    setupMockInvoke("true");
    render(<App />);

    const subagentRow = await screen.findByText("Inspector Subagent One");
    fireEvent.click(subagentRow);

    await screen.findByRole("button", { name: "More actions" });
    const cluster = screen.getByTestId("inspector-cap-trailing");
    expect(cluster.children.length).toBeGreaterThan(0);
    for (const child of Array.from(cluster.children)) {
      const classes = (child as HTMLElement).className.split(/\s+/).filter(Boolean);
      const strayMargin = classes.find((c) => /^m[xlr]-/.test(c));
      expect(strayMargin, `unexpected margin class on a direct child: "${strayMargin}"`).toBeUndefined();
    }
  });

  /* Karthik, 2026-08-30, reversing his own 2026-08-18 ruling. The empty
     inspector used to carry an eyebrow reading "MCP servers · Global" whenever
     the pane's filter was MCP. Its scope word was derived from
     `crumbSegments[crumbSegments.length - 1]` (App.tsx), so once the chrome
     work moved the breadcrumb into the cap band this release, the same word
     rendered twice on one screen. The empty state's own copy already says
     nothing is selected, and the filter chip already names the kind. */
  it("17. The empty inspector carries no eyebrow — the crumb in the band already names the scope", async () => {
    setupMockInvoke("true");
    render(<App />);

    await screen.findByText("Nothing selected");
    const toolsFilter = screen.getByText("MCP servers");
    fireEvent.click(toolsFilter);
    await screen.findByText("Nothing selected");

    // One "MCP servers" on screen: the filter chip. The eyebrow was a second.
    expect(screen.getAllByText("MCP servers")).toHaveLength(1);
  });
});
