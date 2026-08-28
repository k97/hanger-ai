// @vitest-environment happy-dom
//
// Disclosure is non-blocking: linking stays instant and the notice appears in
// the pane that already opens after a link (App auto-selects the new root).
// A blocking prompt would have to open before the walk finishes, so the common
// case — one ordinary project, zero nested repos — would pay a modal flash for
// a question that never comes.
//
// Since 2026-08-28 the notice is the hero band's foot row rather than a
// DisclosureBanner of its own — the thing it qualifies is the per-engine
// tally directly above it. The band is what folds now, so "collapsed by
// default" is asserted against `enginesBandOpen`.

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

function renderPane(
  inventory: Inventory,
  linkedRepos: string[] = ["/Users/k/Work"],
  enginesBandOpen = true
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
      enginesBandOpen={enginesBandOpen}
      onToggleEnginesBand={() => {}}
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
    expect(screen.getByText("3 nested repos count towards this row")).toBeDefined();
  });

  it("uses the singular form for one candidate", () => {
    renderPane(inventoryWith(["/Users/k/Work/repo1"]));
    expect(screen.getByText("1 nested repo counts towards this row")).toBeDefined();
  });

  it("subtracts candidates that are already linked", () => {
    renderPane(
      inventoryWith(["/Users/k/Work/repo1", "/Users/k/Work/repo2"]),
      ["/Users/k/Work", "/Users/k/Work/repo1"]
    );
    expect(screen.getByText("1 nested repo counts towards this row")).toBeDefined();
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

  it("ships folded so the notice stays non-intrusive", () => {
    const { unmount } = renderPane(inventoryWith(["/Users/k/Work/repo1"]), undefined, false);
    // The foot row lives inside the band; folded, none of it is in the DOM.
    expect(screen.queryByTestId("hero-band-foot")).toBeNull();
    expect(screen.queryByText("/Users/k/Work/repo1")).toBeNull();
    unmount();
    renderPane(inventoryWith(["/Users/k/Work/repo1"]));
    expect(screen.getByText("/Users/k/Work/repo1")).toBeDefined();
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
        enginesBandOpen
        onToggleEnginesBand={() => {}}
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
