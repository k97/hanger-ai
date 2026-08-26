// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RepoPane from "./RepoPane";
import { Inventory } from "../App";

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
});
