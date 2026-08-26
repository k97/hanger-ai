// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import RepoPane from "./RepoPane";
import { Inventory } from "../App";

// System Settings > Files & Folders has no "+" — apps appear there only
// after triggering a real TCC prompt, and Hanger never has. The picker is
// the only remedy that actually works, so it is mocked rather than left to
// hit a real dialog.
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

// This file now renders RepoPane more than once; without an explicit
// cleanup, later tests would query a DOM still holding earlier renders and
// "getByText" would find duplicates across them.
afterEach(() => {
  cleanup();
  vi.mocked(open).mockReset();
});

// Contract with scanner.rs::denial_warning: only a warning that STARTS WITH
// "macOS blocked access to" is EPERM and drives the TCC panel. A Unix
// "Permission denied" (EACCES) is a chmod problem, and a machine-scope
// denial deliberately leads with an engine name so it cannot hijack a panel
// that renders the *project* path — both stay in the plain warnings list.
const mockInventoryWithTccWarning: Inventory = {
  agents: [],
  skills: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [
    {
      path: "/home/user/project",
      parse_warnings: [
        "macOS blocked access to /home/user/project",
        "Permission denied: /home/user/project/vendored",
        "Malformed frontmatter in skill at /home/user/project/SKILL.md",
        "Cline may be installed — macOS blocked access to /Users/user/Documents/Cline",
      ],
      layered: false,
      rule_chains: {},
    },
  ],
};

describe("RepoPane TCC Warnings Relocation", () => {
  it("routes only the project-scope EPERM warning to the TCC panel", () => {
    const handleSelectAsset = vi.fn();
    const handleRefresh = vi.fn();
    const handleLinkFromProfile = vi.fn();

    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventoryWithTccWarning}
        loading={false}
        onRefresh={handleRefresh}
        onSelectAsset={handleSelectAsset}
        onLinkFromProfile={handleLinkFromProfile}
      />
    );

    // Verify TCC Fix Panel header
    expect(screen.getByText("macOS Folder Scan Access Denied")).toBeDefined();

    // Verify TCC Fix Panel button
    expect(screen.getByText("Retry Scan")).toBeDefined();

    // The retry button carries the animated rescan mark at 13px — the
    // "keep the split, fix the outlier" ruling (this was the one 12px
    // button among the app's action-button icons; 13px is where those sit).
    const retrySvg = screen.getByText("Retry Scan").closest("button")!.querySelector("svg")!;
    expect(retrySvg.getAttribute("width")).toBe("13");
    expect(retrySvg.querySelector('path[d="M3 3v5h5"]')).toBeTruthy();
    // Not scanning in this fixture (loading: false) — the mark should not
    // be mid-loop.
    expect(retrySvg.querySelector("g.aim-loop")).toBeNull();

    // …and the other three warnings stay in the plain list: a Unix
    // "Permission denied" is a chmod problem, and the machine-scope Cline
    // denial (despite containing "macOS blocked access to" mid-string) does
    // not start with it, so it cannot hijack a panel that renders this
    // project's own path.
    const warningBanner = screen.getByRole("button", { name: /3 scan warnings/i });
    fireEvent.click(warningBanner);
    expect(screen.getByText("Permission denied: /home/user/project/vendored")).toBeDefined();
    expect(screen.getByText("Malformed frontmatter in skill at /home/user/project/SKILL.md")).toBeDefined();
    expect(
      screen.getByText("Cline may be installed — macOS blocked access to /Users/user/Documents/Cline")
    ).toBeDefined();
    expect(screen.queryByText("macOS blocked access to /home/user/project")).toBeNull();
  });

  it("no longer sends the user on an impossible System Settings trip", () => {
    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventoryWithTccWarning}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );

    // The Files & Folders pane cannot be used to grant access it was never
    // asked for, and Hanger deliberately never wants Full Disk Access — both
    // mentions must be gone from the panel body.
    expect(screen.queryByText(/System Settings/)).toBeNull();
    expect(screen.queryByText(/Full Disk Access/)).toBeNull();
    expect(
      screen.getByText(
        "macOS is blocking Hanger from reading this folder. Choose it again to restore access: macOS counts picking a folder as permission to read it."
      )
    ).toBeDefined();
  });

  it("offers a folder picker defaulting to the blocked path, before Retry Scan", () => {
    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventoryWithTccWarning}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );

    const chooseButton = screen.getByText("Choose Folder Again").closest("button")!;
    const retryButton = screen.getByText("Retry Scan").closest("button")!;

    // Placement: the picker is the primary action and comes first.
    expect(
      chooseButton.compareDocumentPosition(retryButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(chooseButton);

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, defaultPath: "/home/user/project" })
    );
  });

  it("rescans after the user re-picks the blocked folder", async () => {
    (open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("/home/user/project");
    const handleRefresh = vi.fn();

    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventoryWithTccWarning}
        loading={false}
        onRefresh={handleRefresh}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Choose Folder Again").closest("button")!);

    await waitFor(() => expect(handleRefresh).toHaveBeenCalled());
  });

  it("does not rescan when the picker is dismissed with no selection", async () => {
    (open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const handleRefresh = vi.fn();

    render(
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventoryWithTccWarning}
        loading={false}
        onRefresh={handleRefresh}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Choose Folder Again").closest("button")!);

    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(handleRefresh).not.toHaveBeenCalled();
  });
});
