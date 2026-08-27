// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import RepoPane from "./RepoPane";
import Flyout from "./Flyout";
import { Inventory } from "../App";
import { buildDetailAsset } from "../utils/detailAsset";

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
  skills: [
    {
      id: "skill-1",
      name: "Provenance Skill",
      description: "A skill with a known origin",
      version: "1.0.0",
      path: "/home/user/project/.claude/skills/prov/SKILL.md",
      scope: { Project: { agent: "unknown", root: "/home/user/project" } },
      drifted: false,
      origin: { kind: "declared", label: "acme-plugin" },
    },
  ],
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
    if (asset.category === "Skills") {
      fullAsset = mockInventory.skills.find((s) => s.path === asset.path);
    } else if (asset.category === "Tools") {
      fullAsset = mockInventory.tools.find((t) => t.config_path === asset.path);
    } else if (asset.category === "Rules") {
      fullAsset = mockInventory.rules.find((r) => r.path === asset.path);
    }

    if (fullAsset) {
      // The real production function App.tsx's handleSelectAsset calls —
      // not a hand-rolled mirror. This is what makes the click below an
      // actual exercise of the code Task 11 changed, not just a check that
      // this test file agrees with itself.
      setFlyoutInitialAsset({ type: "asset", ...buildDetailAsset(asset, fullAsset) });
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

  it("hosts the link flow inside the inspector, with a way back to the asset", async () => {
    render(
      <Flyout
        selectedBubble={{ type: "project", id: "/home/user/project", name: "project" }}
        initialDeployingAsset={{
          type: "asset",
          category: "Tools",
          name: "Global Node Tool",
          path: "/home/user/project/tools.json",
          scopeBadge: "Project",
          isSymlink: false,
          drifted: false,
        }}
        inventory={mockInventory}
        linkedProjects={["/home/user/project"]}
        onRefresh={vi.fn()}
      />
    );

    // The link screen replaces the detail screen inside the same panel; it
    // does not open over the top of it as the retired modal did.
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Link to projects");
    expect(document.querySelectorAll("h2")).toHaveLength(1);

    // The eyebrow is the way back, and it names where back goes.
    fireEvent.click(screen.getByRole("button", { name: "Back to Global Node Tool" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Global Node Tool");
  });

  // Task 11: the backend resolves `origin`/`origin_blocked` on every asset,
  // but until the object handed to the inspector actually carries them, the
  // Origin row always sees `undefined` and (since it carries neither an
  // origin nor a blocked check) renders nothing at all. Reverting the two
  // fields added to the harness's own handleSelectAsset above (mirroring
  // App.tsx's real one) reddens this.
  it("threads the resolved origin through to the inspector's Origin row", async () => {
    render(<TestAppHarness />);

    const skillRow = screen.getByText("Provenance Skill");
    fireEvent.click(skillRow);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Provenance Skill");

    // The Origin row lives on the inspector's Details tab, not the Content
    // tab it opens on.
    fireEvent.click(screen.getByRole("tab", { name: "Details" }));

    const originRow = screen.getByTestId("identity-row-origin");
    expect(originRow.textContent).toContain("acme-plugin");
    expect(originRow.textContent).not.toContain("Written here");
  });

  it("draws the agent's own mark beside the bubble heading, not a generic one", () => {
    render(
      <Flyout
        selectedBubble={{ type: "agent", id: "claude_code", name: "Claude Code" }}
        inventory={mockInventory}
        linkedProjects={[]}
        onRefresh={vi.fn()}
      />
    );

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Claude Code");
    // Paired with the heading text: the mark riding beside it must resolve
    // to this agent specifically.
    const headingRow = heading.parentElement as HTMLElement;
    expect(headingRow.querySelector("svg")?.getAttribute("data-brand")).toBe("claude_code");
  });
});
