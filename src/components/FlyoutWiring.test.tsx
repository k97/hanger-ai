// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import RepoPane from "./RepoPane";
import Flyout from "./Flyout";
import { Inventory } from "../App";

// Mock Tauri invoke to avoid throwing
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((cmd) => {
    if (cmd === "get_rules_target_memory") return Promise.resolve(null);
    return Promise.resolve(null);
  }),
}));

afterEach(() => {
  cleanup();
});

const mockInventory: Inventory = {
  agents: [],
  skills: [],
  tools: [
    {
      id: "tool-1",
      name: "Global Node Tool",
      command: "node run",
      transport: "stdio",
      config_path: "/home/user/project/tools.json",
      scope: { Project: { agent: "unknown", root: "/home/user/project" } },
      owning_agent: "unknown",
      drifted: false,
    }
  ],
  rules: [
    {
      id: "rule-1",
      name: "CLAUDE.md",
      path: "/home/user/project/CLAUDE.md",
      content: "project rules text content",
      scope: { Project: { agent: "unknown", root: "/home/user/project" } },
      drifted: false,
    }
  ],
  subagents: [],
  project_scans: [],
};

// Simple Test Harness to simulate the App component state wiring
function TestAppHarness() {
  const [selectedBubble, setSelectedBubble] = useState<any>(null);
  const [flyoutInitialAsset, setFlyoutInitialAsset] = useState<any>(null);

  const handleSelectAsset = (asset: { name: string; category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents"; path: string }) => {
    let fullAsset: any = null;
    if (asset.category === "Tools") {
      fullAsset = mockInventory.tools.find((t) => t.config_path === asset.path);
    } else if (asset.category === "Rules") {
      fullAsset = mockInventory.rules.find((r) => r.path === asset.path);
    }

    if (fullAsset) {
      setFlyoutInitialAsset({
        type: "asset",
        category: asset.category,
        name: fullAsset.name,
        path: asset.path,
        scopeBadge: "Project",
        isSymlink: false,
        drifted: false,
      });
    }

    setSelectedBubble({
      type: "project",
      id: "/home/user/project",
      name: "project",
    });
  };

  return (
    <div>
      <RepoPane
        repoPath="/home/user/project"
        inventory={mockInventory}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={handleSelectAsset}
        onLinkFromProfile={vi.fn()}
      />
      {selectedBubble && (
        <Flyout
          selectedBubble={selectedBubble}
          setSelectedBubble={(val) => {
            setSelectedBubble(val);
            setFlyoutInitialAsset(null);
          }}
          selectedAsset={flyoutInitialAsset}
          inventory={mockInventory}
          linkedProjects={["/home/user/project"]}
          onRefresh={vi.fn()}
        />
      )}
    </div>
  );
}

describe("Detail Flyout Wiring Integration", () => {
  it("should open details for the specific clicked asset", async () => {
    render(<TestAppHarness />);

    // Check that we see the Tool and Rule rows
    const toolRow = screen.getByText("Global Node Tool");
    const ruleRow = screen.getByText("CLAUDE.md");
    expect(toolRow).toBeTruthy();
    expect(ruleRow).toBeTruthy();

    // The inspector titles whatever is selected, so the heading is the thing
    // that must change — asserting the name appears "somewhere" would pass on
    // the row that was already on screen.
    fireEvent.click(toolRow);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Global Node Tool");

    // Selecting a second asset must replace the first, not sit on top of it.
    fireEvent.click(ruleRow);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("CLAUDE.md");
  });
});
