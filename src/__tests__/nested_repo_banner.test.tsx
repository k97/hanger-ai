// @vitest-environment happy-dom
//
// Disclosure is non-blocking: linking stays instant and the notice appears in
// the pane that already opens after a link (App auto-selects the new root).
// A blocking prompt would have to open before the walk finishes, so the common
// case — one ordinary project, zero nested repos — would pay a modal flash for
// a question that never comes.
//
// Since 2026-08-28 the notice left its DisclosureBanner for the hero band's
// foot row, and since Task 6 of docs/plans/2026-11-27-repo-view-parity.md it
// is the overview card's own section above the actions (round 29, layout A).
// Nothing folds (round 28 q6), so the tests read the card docked.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import RepoPane from "../components/RepoPane";
import SidebarScanModal from "../components/SidebarScanModal";
import type { Inventory } from "../App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({})),
}));

const DEPTH_CAP_WARNING =
  "Scan depth capped at 6 levels for broad root directory. Deeper folders skipped.";

function inventoryWith(
  candidates: string[],
  warnings: string[] = []
): Inventory {
  return {
    skills: [],
    agents: [],
    tools: [],
    rules: [],
    subagents: [],
    project_scans: [
      {
        path: "/Users/k/Work",
        layered: false,
        rule_chains: {},
        parse_warnings: warnings,
        nested_repo_candidates: candidates,
      },
    ],
  } as unknown as Inventory;
}

/** A cap slot for the card's button; docked, the card draws in the pane. */
const docked = () => {
  const cap = document.createElement("span");
  document.body.appendChild(cap);
  return { overviewSlots: { cap }, forceDock: true };
};

function renderPane(
  inventory: Inventory,
  linkedRepos: string[] = ["/Users/k/Work"]
) {
  return render(
    <RepoPane
      repoPath="/Users/k/Work"
      inventory={inventory}
      assetCounts={null}
      loading={false}
      linkedRepos={linkedRepos}
      onRefresh={() => {}}
      onSelectAsset={() => {}}
      onLinkFromProfile={() => {}}
      onPromoteCandidates={() => {}}
      {...docked()}
    />
  );
}

afterEach(() => cleanup());

describe("nested repository notice", () => {
  it("announces unlinked candidates found inside the root", () => {
    renderPane(
      inventoryWith([
        "/Users/k/Work/repo1",
        "/Users/k/Work/repo2",
        "/Users/k/Work/repo3",
      ])
    );
    expect(screen.getByText("3 nested repos are counted in Work")).toBeDefined();
  });

  /* Minor 8 (final review, 2026-08-28): the paths were joined with " · " into
     one `truncate` span, so on a root with several nested repositories every
     path after the first was clipped off the end of one line. The banner this
     replaced gave each path its own `break-all` line.

     Nothing caught it because the one assertion on a path renders a SINGLE
     candidate, where a join of one is the path itself. Three is what tells
     the two apart.

     Wrong implementation this catches: any join into one node — `getByText`
     matches an element's whole text, so a joined span has no element whose
     text is `/Users/k/Work/repo2`. */
  it("gives each nested path its own line, not one joined and truncated span", () => {
    const paths = ["/Users/k/Work/repo1", "/Users/k/Work/repo2", "/Users/k/Work/repo3"];
    renderPane(inventoryWith(paths));
    for (const path of paths) {
      const line = screen.getByText(path);
      expect(line.className).toContain("break-all");
      expect(line.className).not.toContain("truncate");
    }
  });

  it("uses the singular form for one candidate", () => {
    renderPane(inventoryWith(["/Users/k/Work/repo1"]));
    expect(screen.getByText("1 nested repo is counted in Work")).toBeDefined();
  });

  it("subtracts candidates that are already linked", () => {
    renderPane(
      inventoryWith(["/Users/k/Work/repo1", "/Users/k/Work/repo2"]),
      ["/Users/k/Work", "/Users/k/Work/repo1"]
    );
    expect(screen.getByText("1 nested repo is counted in Work")).toBeDefined();
  });

  it("shows nothing when every candidate is already linked", () => {
    renderPane(inventoryWith(["/Users/k/Work/repo1"]), [
      "/Users/k/Work",
      "/Users/k/Work/repo1",
    ]);
    expect(screen.queryByText(/nested repo/)).toBeNull();
  });

  it("shows nothing when the root holds no candidates", () => {
    renderPane(inventoryWith([]));
    expect(screen.queryByText(/nested repo/)).toBeNull();
  });

  it("discloses that the search was depth-capped on a broad root", () => {
    renderPane(inventoryWith(["/Users/k/Work/repo1"], [DEPTH_CAP_WARNING]));
    // "1 nested repo" would otherwise read as a complete answer when the walk
    // stopped at 6 levels and deeper repositories were never examined.
    expect(screen.getByText(/stopped at 6 levels/i)).toBeDefined();
  });

  it("does not claim truncation on an ordinary root", () => {
    renderPane(inventoryWith(["/Users/k/Work/repo1"]));
    expect(screen.queryByText(/stopped at 6 levels/i)).toBeNull();
  });

  it("hands the unlinked candidates to the promote action", () => {
    const onPromote = vi.fn();
    render(
      <RepoPane
        repoPath="/Users/k/Work"
        inventory={inventoryWith(["/Users/k/Work/repo1", "/Users/k/Work/repo2"])}
        assetCounts={null}
        loading={false}
        linkedRepos={["/Users/k/Work", "/Users/k/Work/repo1"]}
        onRefresh={() => {}}
        onSelectAsset={() => {}}
        onLinkFromProfile={() => {}}
        onPromoteCandidates={onPromote}
        {...docked()}
      />
    );
    fireEvent.click(screen.getByText("Promote…"));
    expect(onPromote).toHaveBeenCalledWith(["/Users/k/Work/repo2"]);
  });
});

describe("promote modal", () => {
  it("renders candidates from props without starting a scan", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    render(
      <SidebarScanModal
        isOpen
        candidates={["/Users/k/Work/repo1", "/Users/k/Work/repo2"]}
        depthCapped={false}
        onClose={() => {}}
        onLinked={() => {}}
      />
    );

    expect(screen.getByText("repo1")).toBeDefined();
    expect(screen.getByText("repo2")).toBeDefined();
    expect(invoke).not.toHaveBeenCalledWith("start_repo_scan", expect.anything());
  });
});
