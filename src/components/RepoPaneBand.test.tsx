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
