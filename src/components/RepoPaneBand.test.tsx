// @vitest-environment happy-dom
//
// The hero band and the review pill on a project pane. The Engines line, the
// scan-warning banner and the nested-repo banner all used to be siblings of
// the hero; they are now the band's rows, the pill's popover lines, and the
// band's foot row respectively.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import RepoPane from "./RepoPane";
import type { Inventory } from "../App";

afterEach(cleanup);

/* `projectScan` is not a prop: RepoPane finds this repository's scan inside
   the inventory by path (`inventory.project_scans.find`). */
const inventory = {
  skills: [],
  tools: [],
  rules: [],
  subagents: [],
  agents: [],
  project_scans: [
    {
      path: "/Users/test/proj",
      layered: false,
      rule_chains: {},
      parse_warnings: ["/Users/test/proj/.claude/agents/drafts: Permission denied"],
      nested_repo_candidates: ["/Users/test/proj/packages/site"],
    },
  ],
} as unknown as Inventory;

const base = {
  repoPath: "/Users/test/proj",
  inventory,
  // `assetCounts.engines` is keyed by `engines.display_name`
  // (`scanner.rs::count_assets`), so "Claude Code", not `claude_code` and not
  // the hyphenated `claude-code` an MCP host id carries. BrandIcon resolves
  // any of them; the fixture matches its producer, not the other way round.
  assetCounts: { total: 4, byCategory: {}, engines: { "Claude Code": 1, none: 3 } },
  loading: false,
  onRefresh: vi.fn(),
  onSelectAsset: vi.fn(),
  onLinkFromProfile: vi.fn(),
  issues: [],
  onReview: vi.fn(),
  enginesBandOpen: true,
  onToggleEnginesBand: vi.fn(),
};

describe("RepoPane hero band and pill", () => {
  it("the engines line is gone; the band lists each engine with its asset count, 'none' last", () => {
    render(<RepoPane {...base} />);
    expect(screen.queryByText("Engines")).toBeNull();
    const rows = screen.getAllByTestId(/^hero-band-row-/);
    expect(rows[0].textContent).toContain("Claude Code");
    expect(rows[0].textContent).toContain("1");
    expect(rows[0].textContent).toContain("asset");
    expect(rows[1].textContent).toContain("Any agent");
    expect(rows[1].textContent).toContain("3");
  });

  /* Important 3 (final review, 2026-08-28), ruled: hide the engine rows on a
     category tab, keep the nested-repo foot.

     `assetCounts.engines` is flattened across every category — `count_assets`
     groups by (category, scope, engine) and then accumulates the engine map
     with no category key at all (`scanner.rs:63-64`), and App passes it
     straight through. So on the Skills tab the hero reads "12 skills in proj"
     directly above a band saying "Claude Code 200 assets", two figures about
     different populations a few pixels apart. Narrowing the band needs a new
     backend field; hiding it is honest and reversible.

     Wrong implementation this catches: rendering the root-wide rows on every
     tab, which is what shipped. */
  it("a category tab shows no engine rows — that numeral is root-wide, the hero's is not", () => {
    render(<RepoPane {...base} selectedCategory="Skills" />);
    expect(screen.queryAllByTestId(/^hero-band-row-/)).toEqual([]);
    expect(screen.getByTestId("hero-band-foot")).toBeTruthy();
  });

  it("the All tab is unchanged: the rows are back", () => {
    render(<RepoPane {...base} selectedCategory={null} />);
    expect(screen.getAllByTestId(/^hero-band-row-/).length).toBeGreaterThan(0);
  });

  it("the subtitle no longer counts engines", () => {
    render(<RepoPane {...base} />);
    expect(screen.queryByText(/· 1 engine/)).toBeNull();
    expect(screen.getByText("assets in proj")).toBeTruthy();
  });

  it("scan warnings and this repo's issues are the pill's lines; no scan-warning banner", () => {
    const issue = { id: "i1", name: "security-reviewer.md", category: "Subagents", kind: "parse", problem: "Won't parse", path: "/Users/test/proj/.claude/agents/security-reviewer.md", whereLabel: "proj", whereKeys: ["/Users/test/proj"], crossRepo: false };
    render(<RepoPane {...base} issues={[issue] as never} />);
    expect(screen.queryByText(/scan warning/i)).toBeNull();
    fireEvent.click(screen.getByText("Needs review 2"));
    const lines = screen.getAllByTestId("finding-popover-line");
    expect(lines[0].textContent).toContain("Won't parse");
    expect(lines[0].textContent).toContain("security-reviewer.md");
    expect(lines[1].textContent).toContain("The scan skipped something it could not read.");
    expect(lines[1].textContent).toContain("Permission denied");

    // A won't-parse asset is a danger in the inspector cap's chip
    // (`issueSeverity` — broken OR parse). The hero must not paint the
    // same issue a warning; `kind === "broken"` alone gives this dot
    // bg-state-warning, which is what this catches.
    const dot = lines[0].querySelector("i")!;
    expect(dot.className).toContain("bg-state-danger");
    expect(dot.className).not.toContain("bg-state-warning");
  });

  it("a duplicate in the list withholds 'Show in list', because the filter cannot reach it", () => {
    // `needsReview` (linkStateCounts.ts:45-48) is broken-or-drifted, so
    // "needs-review" filters a duplicate straight out of the list the button
    // offers to show it in. Rendering the button anyway is the bug.
    const duplicate = { id: "i1", name: "math", category: "Skills", kind: "duplicate", problem: "Duplicated in 3 places", path: "/Users/test/proj/math", whereLabel: "proj", whereKeys: ["/Users/test/proj"], crossRepo: true };
    render(<RepoPane {...base} issues={[duplicate] as never} />);
    fireEvent.click(screen.getByText("Needs review 2"));
    expect(screen.getByText("Needs review →")).toBeTruthy();
    expect(screen.queryByText("Show in list")).toBeNull();
  });

  it("without a duplicate, both actions render", () => {
    const broken = { id: "i1", name: "a", category: "Rules", kind: "broken", problem: "Target is gone", path: "/Users/test/proj/a", whereLabel: "proj", whereKeys: ["/Users/test/proj"], crossRepo: false };
    render(<RepoPane {...base} issues={[broken] as never} />);
    fireEvent.click(screen.getByText("Needs review 2"));
    expect(screen.getByText("Show in list")).toBeTruthy();
    expect(screen.getByText("Needs review →")).toBeTruthy();
  });

  /* Important 2 (final review, 2026-08-28): with only a scan warning behind
     it — no ReviewIssue anywhere — `Needs review →` routed to a Needs review
     pane that then said "Nothing needs a decision". A warning is not an
     asset and has no row to open; the popover is its whole disclosure.

     Wrong implementation this catches: an action row gated on the pill's own
     line count, or on nothing at all, rather than on `issues`. */
  it("a scan warning with no issues behind it: the popover discloses, and offers nowhere to go", () => {
    render(<RepoPane {...base} issues={[]} />);
    fireEvent.click(screen.getByText("Needs review 1"));
    expect(screen.getByTestId("finding-popover-line").textContent).toContain(
      "The scan skipped something it could not read."
    );
    expect(screen.queryByText("Needs review →")).toBeNull();
    expect(screen.queryByText("Show in list")).toBeNull();
  });

  it("'Needs review →' routes with the first issue", () => {
    const onReview = vi.fn();
    const issue = { id: "i1", name: "a", category: "Rules", kind: "broken", problem: "Target is gone", path: "/Users/test/proj/a", whereLabel: "proj", whereKeys: ["/Users/test/proj"], crossRepo: false };
    render(<RepoPane {...base} issues={[issue] as never} onReview={onReview} />);
    fireEvent.click(screen.getByText("Needs review 2"));
    fireEvent.click(screen.getByText("Needs review →"));
    expect(onReview).toHaveBeenCalledWith(issue);
  });

  it("the nested repo is the band's foot row with Promote…, not a banner", () => {
    const onPromote = vi.fn();
    render(<RepoPane {...base} onPromoteCandidates={onPromote} />);
    expect(screen.queryByText(/nested repo$/)).toBeNull();
    const foot = screen.getByTestId("hero-band-foot");
    expect(foot.textContent).toContain("1 nested repo counts towards this row");
    expect(foot.textContent).toContain("packages/site");
    fireEvent.click(screen.getByText("Promote…"));
    expect(onPromote).toHaveBeenCalledWith(["/Users/test/proj/packages/site"]);
  });
});
